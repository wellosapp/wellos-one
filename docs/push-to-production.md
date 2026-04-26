# Code Deployment Playbook — Pushing to the DigitalOcean Droplet

**Target:** DigitalOcean Droplet — 4 vCPU / 8 GB RAM / 80 GB SSD, Ubuntu 24.04 LTS
**Scope:** How code moves from a developer's laptop to production on the Droplet.
**Related docs:** `digitalocean-droplets.md`, `digitalocean-api.md`, `deep-research-report.md`

---

## 1. The Deployment Flow at a Glance

```
Developer laptop
     │
     │  1. git push → feature branch
     ▼
GitHub repository
     │
     │  2. Pull Request → code review → merge to main
     ▼
GitHub Actions (CI)
     │   • Run tests
     │   • Build Docker image
     │   • Tag with git SHA + "latest"
     │   • Push to DigitalOcean Container Registry
     ▼
DigitalOcean Container Registry
     │
     │  3. Deploy job pulls new image
     ▼
Droplet (production)
     │   • docker compose pull
     │   • Run DB migrations
     │   • Rolling restart behind nginx/Caddy
     │   • Health check passes
     ▼
Live traffic served from the new version
```

No step in this flow involves anyone SSHing into the Droplet and editing files by hand. That is a hard rule. The Droplet is a cattle-not-pets server: everything on it is reproducible from git and the cloud-init script. If SSH is needed to fix something in production, the follow-up task is always "codify the fix so the next deploy does it automatically."

---

## 2. Repositories and Branching

**One repository**, containing:

```
/
├── app/                      # Application source code
├── infra/
│   ├── cloud-init/           # Droplet bootstrap script
│   ├── terraform/            # DO infrastructure as code
│   ├── nginx/                # Reverse proxy config
│   └── systemd/              # Service unit files
├── docker/
│   ├── Dockerfile            # App image definition
│   └── docker-compose.yml    # Production compose file
├── .github/workflows/        # CI/CD pipelines
├── migrations/               # Database migrations
└── README.md
```

**Branching model:**

- `main` — always deployable. Protected branch. Direct pushes disabled. Merges require PR review + green CI.
- `feature/*` — short-lived feature branches, one per ticket. Merged via PR, deleted after merge.
- `hotfix/*` — emergency fixes branched from `main`, merged back via fast-track PR.

**Tags:**

- Every production deploy creates an annotated git tag: `deploy-YYYY-MM-DD-NNN`. This is what we roll back to, not a branch.

---

## 3. Prerequisites (one-time setup)

### On the Droplet

The cloud-init user-data script (see `infra/cloud-init/droplet-bootstrap.yml`) handles all of this at first boot. Listed here for reference:

- `deploy` sudo user with our team SSH keys.
- Docker + Docker Compose plugin installed.
- `nginx` (or `caddy`) installed and configured as the reverse proxy.
- UFW configured: deny inbound by default, allow 22 (from our IPs), 80, 443.
- `unattended-upgrades` configured for security patches.
- 2 GB swap file.
- `doctl` installed and authenticated with a **deploy-scoped** token (read Container Registry, read Droplets — nothing else).
- `/opt/app/` directory owned by `deploy`, containing `docker-compose.yml` pulled from the repo at provision time.

### In GitHub

Repository secrets (Settings → Secrets and variables → Actions):

| Secret | Purpose | Scope |
|---|---|---|
| `DIGITALOCEAN_ACCESS_TOKEN` | Push images to Container Registry | Container Registry write |
| `DEPLOY_SSH_KEY` | Private key for CI → Droplet SSH | Deploy user only |
| `DEPLOY_HOST` | Droplet public IP or DNS name | — |
| `DEPLOY_USER` | `deploy` | — |
| `DATABASE_URL` | Managed DB connection string | Only used for migration job |
| `SENTRY_DSN` | Error reporting | — |

Never put any of these in `.env` files committed to the repo. The only thing checked in is `.env.example` with placeholder values.

### In DigitalOcean

- Container Registry created: `registry.digitalocean.com/<team-name>/app`.
- Droplet tagged `app-web` and `env:prod`.
- Cloud Firewall `inbound-web-prod` applied to the `app-web` tag.
- Managed Postgres DB created in the same VPC as the Droplet.
- Spaces bucket `app-prod-uploads` created for user-uploaded files.

---

## 4. CI/CD Pipeline (GitHub Actions)

Two workflows: `ci.yml` runs on every PR; `deploy.yml` runs on every push to `main`.

### `ci.yml` — Pull Request Checks

```yaml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up runtime
        uses: actions/setup-node@v4  # adjust for our stack
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Lint
        run: npm run lint
      - name: Type check
        run: npm run typecheck
      - name: Unit tests
        run: npm test
      - name: Build image (verification only, not pushed)
        run: docker build -t app:pr-${{ github.event.pull_request.number }} .
```

If any step fails, the PR cannot be merged. No exceptions.

### `deploy.yml` — Production Deploy

```yaml
name: Deploy
on:
  push:
    branches: [main]

concurrency:
  group: production-deploy
  cancel-in-progress: false   # Never cancel an in-flight deploy.

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    outputs:
      image_tag: ${{ steps.meta.outputs.tag }}
    steps:
      - uses: actions/checkout@v4
      - name: Install doctl
        uses: digitalocean/action-doctl@v2
        with:
          token: ${{ secrets.DIGITALOCEAN_ACCESS_TOKEN }}
      - name: Log in to DO Container Registry
        run: doctl registry login --expiry-seconds 1200
      - name: Compute image tag
        id: meta
        run: echo "tag=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT
      - name: Build and push image
        run: |
          IMG=registry.digitalocean.com/<team>/app
          docker build -t $IMG:${{ steps.meta.outputs.tag }} -t $IMG:latest .
          docker push $IMG:${{ steps.meta.outputs.tag }}
          docker push $IMG:latest

  migrate:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run database migrations
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
        run: npm run migrate:deploy
      # Migrations run BEFORE the new code goes live.
      # Migrations must be backward-compatible with the previous version.

  deploy:
    needs: migrate
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Droplet
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/app
            doctl registry login --expiry-seconds 600
            docker compose pull
            docker compose up -d --remove-orphans
            docker system prune -f
      - name: Health check
        run: |
          for i in {1..30}; do
            if curl -fsS https://app.example.com/healthz; then exit 0; fi
            sleep 5
          done
          echo "Health check failed"; exit 1
      - name: Tag successful deploy
        if: success()
        run: |
          git tag deploy-$(date +%Y-%m-%d)-${{ github.run_number }}
          git push --tags
```

### Why Migrations Run Before the App Restarts

Migrations must be **backward-compatible with the previous version** of the code. That means additive migrations (new columns, new tables) first; destructive migrations (dropping columns) only after the old code is no longer running anywhere. This is the "expand / contract" pattern and it's non-negotiable once we have real users. A deploy that breaks requests in flight because a column disappeared is how we make the news for the wrong reason.

---

## 5. On-Droplet Layout

```
/opt/app/
├── docker-compose.yml        # Committed in repo, pulled by cloud-init
├── .env                      # Populated by cloud-init from DO metadata / secrets manager
├── nginx/
│   └── app.conf              # Proxy config (pulled from repo)
└── data/
    ├── logs/                 # App logs, rotated by logrotate
    └── uploads/              # ONLY during MVP. Move to Spaces before real traffic.
```

### `docker-compose.yml` (production)

```yaml
services:
  app:
    image: registry.digitalocean.com/<team>/app:latest
    restart: unless-stopped
    env_file: .env
    ports:
      - "127.0.0.1:3000:3000"   # Only bound to localhost — nginx terminates TLS publicly
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3

  worker:
    image: registry.digitalocean.com/<team>/app:latest
    restart: unless-stopped
    env_file: .env
    command: ["node", "worker.js"]

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

Postgres is **not** in this compose file. It's in Managed Databases. Redis is here during MVP and will move to Managed Redis when the app grows beyond one Droplet.

### Reverse Proxy

nginx (or Caddy) handles:

- TLS termination (Let's Encrypt certs, auto-renewed).
- HTTP → HTTPS redirect.
- Proxying to `127.0.0.1:3000`.
- Static asset caching.
- Basic rate limiting on auth/booking endpoints.

---

## 6. Rollback

Rollback is more important than deploy. If we can't quickly get back to a known-good version, we can't deploy safely.

### Fast rollback (image already on the Droplet)

```bash
# SSH to the Droplet as deploy user
ssh deploy@$DEPLOY_HOST

cd /opt/app
# Find the previous working image tag
docker images registry.digitalocean.com/<team>/app

# Pin compose to the previous tag
APP_IMAGE_TAG=<previous-sha> docker compose up -d
```

The `docker-compose.yml` should reference an env var (`${APP_IMAGE_TAG:-latest}`) so we can pin a specific tag without editing the file.

### Full rollback (revert a bad commit)

1. `git revert <bad-commit>` on a branch, PR, merge to `main`.
2. CI builds and deploys the reverted code normally.
3. If the bad deploy included a migration, we may need to run a **forward-only** migration to undo the schema change. Never `DROP TABLE` as part of rollback — add a new migration that restores the needed state.

### Database rollback

Managed Postgres supports Point-in-Time Recovery. Use it only for true data corruption, not for reverting code changes. PITR resets the entire database — any legitimate writes that happened after the bad deploy are lost.

---

## 7. Secrets Management

No secrets in the repo. Secrets live in exactly three places:

1. **GitHub Actions secrets** — for CI/CD access.
2. **The Droplet's `.env` file** — written by cloud-init at boot, readable only by the `deploy` user (`chmod 600`).
3. **A real secrets manager** (Doppler, 1Password, or DigitalOcean's own secret management once it's generally available) — the source of truth that cloud-init and CI pull from.

Rotation: any secret that ever appears in CI logs, screen shares, or Slack is considered burned. Rotate it and move on.

---

## 8. Monitoring the Deploy

A successful deploy is not "the CI job went green." It's "the app is serving traffic correctly five minutes later." Every deploy watches:

| Signal | Source | What it tells us |
|---|---|---|
| `/healthz` endpoint 200 OK | Droplet curl check in the deploy job | The container is running. |
| HTTP 5xx rate | APM / log aggregator | Are we breaking requests? |
| Request latency p95 | APM | Did we regress performance? |
| Background job queue depth | Redis metrics | Are workers keeping up? |
| Sentry error spike | Sentry dashboard | New exceptions after deploy? |
| CPU / memory on the Droplet | DO Monitoring | Did the new build balloon resource usage? |

If any of these goes bad in the 15 minutes after a deploy, roll back. Investigate afterward.

---

## 9. Deploy Windows

During MVP: deploy any time, small changes, often. Velocity matters more than protecting an invisible user.

Once we have paying customers:

- **Normal deploys:** Monday–Thursday, business hours in our primary timezone.
- **No deploys:** Friday afternoons, weekends, holidays, anytime the on-call engineer is unavailable — **unless** it's a security or correctness hotfix.
- **Planned maintenance windows** for anything that requires downtime (major DB migrations, region moves). Announced to customers in advance.

"We deploy on Fridays and cross our fingers" is how avoidable incidents happen.

---

## 10. Local Development

Developers run the same Docker Compose stack locally, with a local Postgres and local Redis. The only meaningful difference between local and production is:

- Local uses `.env.local` with development credentials.
- Local builds images directly from the working tree instead of pulling from the registry.
- Local doesn't run behind nginx (the app listens on `3000` directly).

This matters because it means "works on my machine" is a much stronger signal than usual — the container, the dependencies, and the runtime are the same. Drift between local and production is the enemy; keep them as close as possible.

---

## 11. Checklist for Every Deploy

Before merging a PR that will deploy to production:

- [ ] CI is green.
- [ ] PR has been reviewed by someone other than the author.
- [ ] Any new environment variables are documented and added to the secrets store.
- [ ] Database migrations are backward-compatible (can run while old code is still serving).
- [ ] If this is a destructive migration (drop column, drop table), the previous deploy already stopped reading/writing that column.
- [ ] Feature flags are set to the intended rollout state.
- [ ] Someone is watching the dashboards when merge happens.

Before finishing work on a deploy day:

- [ ] All deploys that went out today are still healthy (error rate, latency, queue depth).
- [ ] Any alerts that fired have been acknowledged.
- [ ] The on-call engineer knows what changed today.

---

## 12. References

- Related docs: `digitalocean-droplets.md`, `digitalocean-api.md`, `deep-research-report.md`
- DigitalOcean Container Registry: https://docs.digitalocean.com/products/container-registry/
- DigitalOcean Managed Databases: https://docs.digitalocean.com/products/databases/
- DigitalOcean Spaces: https://docs.digitalocean.com/products/spaces/
- GitHub Actions: https://docs.github.com/en/actions
- Expand / contract migration pattern: https://martinfowler.com/articles/evodb.html
