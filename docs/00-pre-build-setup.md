# 00 — Pre-Build Setup & Daily Workflow Playbook

**Purpose:** This is the single checklist we follow before writing a line of app code, and the daily push/pull rhythm we use once building starts. If it isn't in this doc, it isn't done.

**Related docs (read these after this one):**
- `mindbody-rebuild-master-spec.md` — the engineering blueprint
- `technical-build-spec.md` — what we're building
- `push-to-production.md` — the deploy pipeline (this doc references it, doesn't replace it)
- `digitalocean-droplets.md` — Droplet configuration details
- `digitalocean-api.md` — programmatic DO access
- `09-dev-handoff.md` — epic sequencing

---

## 0. How to Use This Doc

This is a **sequential checklist**. Do the sections in order. Section 1 (accounts) unlocks Section 2 (local tools) unlocks Section 3 (repo) unlocks Section 4 (server) unlocks Section 5 (domain) unlocks Section 6 (CI/CD) unlocks Section 7 (we start building).

Every item has one of three states: **Not Started**, **In Progress**, **Done**. We track these in the companion spreadsheet `00-setup-checklist.xlsx`. When every row in the spreadsheet is green, and only then, we open Epic 1 from `09-dev-handoff.md`.

**Rule:** no skipping ahead. The solo-dev failure mode is half-built foundations. We finish foundations first.

---

## 1. External Accounts & API Keys (Section A of checklist)

Create these accounts, in this order, and record credentials in the password manager (1Password / Bitwarden — not in a text file, not in the repo, not in Slack DMs).

### 1.1 Source control & issue tracking

| Account | Why | What to record |
|---|---|---|
| **GitHub** (org, not personal) | Code, CI/CD, secrets | Org name, billing contact |
| **GitHub Actions** | CI runner minutes | Included with org plan |

### 1.2 Infrastructure

| Account | Why | What to record |
|---|---|---|
| **DigitalOcean** | Droplet, Managed Postgres, Spaces, Container Registry, DNS | Account email, team name, project name |
| **Domain registrar** (Namecheap / Cloudflare / Porkbun) | Own the domain | Domain, renewal date, registrar login |

### 1.3 Payments (MVP: Stripe + Square)

| Account | Why | Phase |
|---|---|---|
| **Stripe (platform)** | Platform default Connect + our own SaaS billing | MVP |
| **Stripe Connect (Standard)** | Tenant onboarding | MVP |
| **Square Developer** | BYO Square adapter | MVP |
| **Clover / Authorize.net** | BYO adapters | Growth — skip for now |

### 1.4 Notifications

| Account | Why | Phase |
|---|---|---|
| **TextLink** | SMS | MVP |
| **Resend** | Transactional email | MVP |

### 1.5 Observability & security

| Account | Why | Phase |
|---|---|---|
| **Sentry** | Error reporting | MVP |
| **Password manager** (1Password / Bitwarden) | Secrets custody | Day 1 |

### 1.6 AI tooling

| Account | Why |
|---|---|
| **Anthropic Console** | Claude Code API access |
| **Claude Code** (CLI) | Our primary coding agent |

For each account, the checklist spreadsheet tracks: account created, billing enabled, team members invited, API key generated, API key stored in password manager, webhook secret stored in password manager. An API key that isn't in the password manager doesn't exist for our purposes.

**Never commit** any of these to git. The only env file in the repo is `.env.example` with empty placeholders.

---

## 2. Local Development Environment (Section B of checklist)

Every developer working on the project needs the same local toolchain. Pin versions. Mismatched Node versions is how three hours disappear.

### 2.1 Required tools

| Tool | Version | Install |
|---|---|---|
| **Node.js** | 20.x LTS | `nvm install 20 && nvm use 20` |
| **pnpm** | 9.x | `corepack enable && corepack prepare pnpm@9 --activate` |
| **Docker Desktop** | latest | docker.com |
| **Git** | 2.40+ | git-scm.com |
| **`doctl`** (DigitalOcean CLI) | latest | `brew install doctl` / `snap install doctl` |
| **`gh`** (GitHub CLI) | latest | `brew install gh` |
| **PostgreSQL client** (`psql`) | 16.x | `brew install postgresql@16` |
| **Redis client** (`redis-cli`) | 7.x | `brew install redis` |
| **Claude Code** (CLI) | latest | see 2.2 |
| **VS Code / Cursor** | latest | editor of choice |

Verify each with: `node -v && pnpm -v && docker -v && git --version && doctl version && gh --version && psql --version && redis-cli --version`.

### 2.2 Claude Code setup

Claude Code is the primary coding agent we drive this build with. It runs in the terminal and edits files in the repo directly.

1. Install: follow the current install instructions at the official Claude Code docs. It requires Node.js 18+ and works on macOS, Linux, and WSL on Windows.
2. Authenticate: on first run Claude Code will prompt for an Anthropic API key or browser sign-in.
3. From inside the repo root: run `claude` to start an interactive session.
4. Create a `CLAUDE.md` file at the repo root (we do this in Section 3.4) — Claude Code reads it automatically to understand project conventions.

**Rule of thumb for using Claude Code on this project:**
- Tell it which doc(s) it should read first (`mindbody-rebuild-master-spec.md`, the relevant epic doc from `09-dev-handoff.md`).
- Scope the task tightly — one ticket at a time, not "build the whole dashboard."
- Review every diff before committing. Claude Code does not commit for us on its own — the human clicks the button.
- When it gets stuck, give it more context (logs, error messages, the exact file it should look at), not more pressure.

### 2.3 SSH keys

1. Generate a dedicated SSH key for this project: `ssh-keygen -t ed25519 -C "your-email+project@example.com" -f ~/.ssh/id_ed25519_projectname`.
2. Add public key to GitHub (Settings → SSH keys).
3. Add public key to DigitalOcean (Settings → Security → SSH keys) — **before** creating the Droplet, so cloud-init can inject it.
4. Add to `~/.ssh/config` so commands pick it up automatically.

### 2.4 Password manager

One shared vault for the project. Required entries before continuing:
- All API keys and webhook secrets from Section 1
- The Droplet root-console password (set after Droplet creation — break-glass only)
- GitHub deploy SSH private key (created in Section 6)

---

## 3. Repository Bootstrap (Section C of checklist)

### 3.1 Create the repo

1. Create **one** GitHub repo under the org. Private. Name it something boring and descriptive.
2. Default branch: `main`. Protect it from day one:
   - Require pull request before merging
   - Require at least one approving review
   - Require status checks to pass (CI) — we'll wire CI in Section 6, add this rule then
   - Disable direct pushes to `main`
3. Clone locally.

### 3.2 Repo structure

Lay down the skeleton from `push-to-production.md` Section 2:

```
/
├── app/                      # Application source (filled in during Epic 1)
├── infra/
│   ├── cloud-init/           # Droplet bootstrap script
│   ├── terraform/            # DO infrastructure as code (optional MVP)
│   ├── nginx/                # Reverse proxy config
│   └── systemd/              # Service unit files
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── .github/workflows/
│   ├── ci.yml
│   └── deploy.yml
├── migrations/
├── docs/                     # Every doc in this project lives here
│   ├── 00-pre-build-setup.md (this file)
│   ├── mindbody-rebuild-master-spec.md
│   ├── technical-build-spec.md
│   ├── push-to-production.md
│   ├── digitalocean-droplets.md
│   ├── digitalocean-api.md
│   ├── 01-design-system.md
│   ├── 02-onboarding-flow.md
│   ├── 03-dashboard-today-view.md
│   ├── 04-booking-flow.md
│   └── 09-dev-handoff.md
├── .env.example
├── .gitignore
├── CLAUDE.md                 # See 3.4
└── README.md
```

### 3.3 `.gitignore` essentials

At minimum:

```
node_modules/
.env
.env.local
.env.*.local
dist/
build/
.DS_Store
*.log
.vscode/settings.json
.idea/
```

### 3.4 `CLAUDE.md` — agent instructions

Create `CLAUDE.md` at the repo root. This is the file Claude Code reads on every session start. Keep it short and factual. A minimal version for this project:

```markdown
# CLAUDE.md — Project Conventions

## What this project is
Multi-vertical booking + scheduling SaaS platform (Mindbody rebuild). See docs/mindbody-rebuild-master-spec.md for the full blueprint.

## Stack
- Node 20 + TypeScript + Fastify (API)
- Next.js (web)
- Postgres via Drizzle ORM
- Redis for queues (BullMQ) and cache
- Deployed to a DigitalOcean Droplet via GitHub Actions (see docs/push-to-production.md)

## Before you write code
1. Read docs/mindbody-rebuild-master-spec.md PART 11 (stack) and the specific PART relevant to the ticket.
2. Read docs/09-dev-handoff.md to know which epic this ticket belongs to.
3. Confirm with me (the human) the file(s) you plan to touch before editing.

## Hard rules
- Never commit .env files or secrets.
- Never push directly to main. Always work on a feature/* branch and open a PR.
- Never run destructive commands (rm -rf, DROP TABLE, force push) without me confirming.
- Use pnpm, not npm or yarn.
- TypeScript strict mode is on. No `any` without a comment explaining why.
- New database columns require a Drizzle migration in /migrations, never schema edits to existing tables without a migration.

## Commit style
- Conventional commits: feat:, fix:, chore:, docs:, refactor:, test:
- One concern per commit.
- Reference the ticket in the body: `Refs: O-3`.

## How to ask for help
If you're blocked on missing context, ask one specific question. Don't guess.
```

### 3.5 `.env.example`

Copy the full env block from `mindbody-rebuild-master-spec.md` Appendix E (the "Environment Variables (Launch Set)" block). Values are empty — this file is a **schema**, not a secret. Anyone cloning the repo runs `cp .env.example .env` and fills in values from the password manager.

### 3.6 README.md

Short. Three sections: what the project is, how to run it locally (fill in once Epic 1 exists), and a link to the docs folder. Not the place for design decisions — those go in `docs/`.

### 3.7 First commit

`chore: initial repo scaffolding`. Push. Verify branch protection is actually enforced by trying to push directly to `main` — it should be rejected.

---

## 4. Server Provisioning — DigitalOcean Droplet (Section D of checklist)

Follow `digitalocean-droplets.md` for the reasoning. This section is the checklist.

### 4.1 Create the Droplet

In the DigitalOcean Control Panel:

1. **Region:** pick the one closest to the majority of users. Stick with it — moving regions later is painful.
2. **Size:** 4 vCPU / 8 GB RAM / 80 GB SSD (Regular or Premium Intel/AMD — match `mindbody-rebuild-master-spec.md` PART 12.1).
3. **Image:** Ubuntu 24.04 LTS.
4. **Features to enable at create time** (enabling them later requires a reboot):
   - [ ] VPC (private networking) — use the default VPC for the region
   - [ ] IPv6
   - [ ] Monitoring (free metrics agent)
   - [ ] Backups (paid add-on — enable it, do not skip)
5. **Authentication:** SSH key only. Select the key added in Section 2.3. No root password login.
6. **User Data:** paste the cloud-init script from `infra/cloud-init/droplet-bootstrap.yml`. This script creates the `deploy` sudo user, installs Docker + nginx, configures UFW, sets up unattended-upgrades, creates a 2 GB swap file. See `digitalocean-droplets.md` Section 4.
7. **Tags:** `app-web`, `env:prod`.
8. **Hostname:** something memorable — `app-prod-01`.

Create the Droplet. Wait 60 seconds for cloud-init to finish.

### 4.2 Verify the Droplet

From your laptop:

```bash
ssh deploy@<droplet-ip>
```

You should log in as `deploy` without being prompted for a password. Then on the Droplet:

```bash
docker --version            # Docker installed
sudo ufw status             # Firewall active, 22/80/443 allowed
systemctl status nginx      # nginx running
cat /etc/passwd | grep deploy   # deploy user exists
sudo -l                     # deploy has sudo
free -h                     # swap shows 2 GB
```

If any of these fail, something went wrong in cloud-init — fix the script, destroy the Droplet, recreate. Do **not** fix things by hand on the Droplet. Cattle, not pets.

### 4.3 Cloud Firewall

In DO → Networking → Firewalls, create `inbound-web-prod`:

| Direction | Protocol | Port | Source | Purpose |
|---|---|---|---|---|
| Inbound | TCP | 22 | Your office IP or VPN CIDR | SSH — never `0.0.0.0/0` |
| Inbound | TCP | 80 | `0.0.0.0/0`, `::/0` | HTTP |
| Inbound | TCP | 443 | `0.0.0.0/0`, `::/0` | HTTPS |
| Inbound | TCP | 5432 | VPC CIDR only | Postgres (internal) |
| Inbound | TCP | 6379 | VPC CIDR only | Redis (internal) |
| Outbound | all | all | all | Default allow |

Apply the firewall to the `app-web` tag. Any Droplet with that tag inherits it.

### 4.4 Managed Postgres

1. DO → Databases → Create Database Cluster.
2. Postgres 16. Same region as the Droplet. Same VPC.
3. Smallest tier that meets the spec — we can resize later.
4. Add the Droplet's tag or IP to the trusted sources list.
5. Copy the connection string (the "private network" one, not the public one).
6. Store in the password manager as `DATABASE_URL`.

### 4.5 DO Container Registry

1. DO → Container Registry → Create.
2. Name: `<team-name>` — the image path becomes `registry.digitalocean.com/<team-name>/app`.
3. From your laptop: `doctl registry login`. This writes creds to Docker.
4. On the Droplet: install and authenticate `doctl` with a **deploy-scoped** token (read Container Registry + read Droplets only — no write). Store that token in the password manager as `DIGITALOCEAN_ACCESS_TOKEN`.

### 4.6 DO Spaces (object storage)

1. DO → Spaces → Create Space.
2. Same region as the Droplet.
3. Name: `app-prod-uploads`.
4. Generate an access key pair (Settings → API → Spaces access keys).
5. Store endpoint, region, bucket name, access key, secret key in the password manager. These become `S3_*` vars in `.env`.

### 4.7 Smoke test

From the Droplet:

```bash
# Can reach Postgres over private VPC
psql "$DATABASE_URL" -c "SELECT 1;"

# Can pull from the registry
doctl registry login
docker pull registry.digitalocean.com/<team-name>/app:latest || echo "no image pushed yet — expected"

# Can reach Spaces
aws --endpoint-url "$S3_ENDPOINT" s3 ls s3://$S3_BUCKET/
```

If all three are clean (the registry one is expected to say "no image" at this point — we haven't built one yet), the server is ready.

---

## 5. Domain & TLS (Section E of checklist)

### 5.1 Point the domain at the Droplet

Decide on the top-level and subdomain structure up front. For this project:

| Hostname | What it is |
|---|---|
| `app.example.com` | Staff web app |
| `booking.example.com` | Consumer booking |
| `api.example.com` | API (if split — optional MVP) |
| `webhooks.example.com` | Inbound webhooks (Stripe, Resend, TextLink) |

At the domain registrar (or better, delegate DNS to DigitalOcean by updating nameservers to `ns1.digitalocean.com`, `ns2.digitalocean.com`, `ns3.digitalocean.com`):

1. If using DO DNS: DO → Networking → Domains → Add your domain.
2. For each hostname above, create an **A record** pointing to the Droplet's public IPv4.
3. Also create **AAAA records** for IPv6 if the Droplet has IPv6 enabled (it should).
4. TTL: 300s while we're still iterating — we can raise it to 3600 once DNS is stable.

Verify propagation: `dig app.example.com +short` should return the Droplet IP. Expect a few minutes.

### 5.2 TLS with Let's Encrypt (Certbot)

On the Droplet, once DNS resolves:

```bash
sudo certbot --nginx \
  -d app.example.com \
  -d booking.example.com \
  -d webhooks.example.com \
  --email ops@example.com \
  --agree-tos \
  --no-eff-email \
  --redirect
```

This issues certs and edits the nginx configs to force HTTPS. Verify:

- `curl -I https://app.example.com` returns 200 (or 502 if no app is running yet — that's fine, the TLS layer is what we're checking).
- `sudo certbot renew --dry-run` succeeds.
- `sudo systemctl list-timers certbot.timer` shows the renewal timer is active.

Add the renewal hook `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh` (see `mindbody-rebuild-master-spec.md` 12.4) and `chmod +x` it.

### 5.3 Webhook subdomain isolation

`webhooks.example.com` gets its own nginx server block with a relaxed rate limit and 30-second timeout (Stripe, TextLink, and Resend webhooks need it). See `mindbody-rebuild-master-spec.md` 12.3.

### 5.4 DNS records for email (later, not now)

Once Resend is wired up for outbound email, it will ask us to add SPF, DKIM, and DMARC records to the domain. Park this — it gets done during Epic 2 when we send our first real email, not during setup.

---

## 6. CI/CD Pipeline (Section F of checklist)

See `push-to-production.md` for the full yaml. This section is the checklist.

### 6.1 GitHub repo secrets

Settings → Secrets and variables → Actions → New repository secret. Add each one from the password manager:

- [ ] `DIGITALOCEAN_ACCESS_TOKEN` — Container Registry write scope
- [ ] `DEPLOY_SSH_KEY` — private key for CI → Droplet (generate a new key pair, add public key to `deploy` user on the Droplet, add private key here)
- [ ] `DEPLOY_HOST` — the Droplet's DNS name (or IP)
- [ ] `DEPLOY_USER` — `deploy`
- [ ] `DATABASE_URL` — used by the migration job only
- [ ] `SENTRY_DSN`
- [ ] All API keys needed at build time (Stripe publishable, etc.)

Repository variables (not secret, but environment-specific):
- [ ] `DO_REGISTRY_NAME`

### 6.2 Workflows

Create `.github/workflows/ci.yml` and `.github/workflows/deploy.yml` — copy directly from `push-to-production.md` Sections 4.

### 6.3 First deploy (smoke test)

Before Epic 1 starts:

1. Create a throwaway branch with a trivial "hello world" Fastify app in `app/`.
2. Open a PR. CI should run lint/typecheck/test — they'll all pass trivially.
3. Merge to `main`. `deploy.yml` should fire, build the Docker image, push to the registry, run migrations (none yet), SSH into the Droplet, pull the image, `docker compose up -d`, and pass the health check at `/healthz`.
4. Hit `https://app.example.com/healthz` from your laptop — should return 200.

If this works, **the platform is ready**. If not, fix CI/CD before writing a single feature. Do not debug deploys while also building features — one unknown at a time.

### 6.4 Branch protection (enable now, not earlier)

With CI wired up, go back to Settings → Branches → `main` branch rule and require the `ci.yml` status check to pass before merging.

---

## 7. Observability & Ops Day-One (Section G of checklist)

Minimum viable ops before we write real features:

- [ ] **Sentry project** created. `SENTRY_DSN` in env. Trigger a test error from the hello-world app — confirm it lands in Sentry.
- [ ] **DO Monitoring alert policies** set up for: CPU > 80% for 5 minutes, disk > 80%, Droplet unreachable. Route to an email / Slack / PagerDuty destination the right person actually watches.
- [ ] **Uptime check** (UptimeRobot, BetterStack, or DO's own uptime monitoring) hitting `/healthz` every minute.
- [ ] **Logs** — structured JSON logs to stdout from the app. Droplet captures them via Docker. For now, `docker logs` is fine; ship to a log service when the volume warrants it (Growth phase).

---

## 8. The Daily Push/Pull Flow

Once Sections 1–7 are green, **this is the rhythm we follow for every ticket** from Epic 1 forward. Print it. Pin it.

### 8.1 Starting a ticket

```bash
# 1. Start fresh — pull latest main
git checkout main
git pull origin main

# 2. Create a feature branch per ticket
git checkout -b feature/O-3-business-profile-setup

# 3. Start Claude Code (or your editor) from the repo root
claude

# 4. Point Claude at the right docs before asking it to build anything
# Example prompt:
#   "Read docs/09-dev-handoff.md Epic 2 and docs/02-onboarding-flow.md. 
#    Then implement ticket O-3. Confirm which files you plan to touch before editing."
```

**Rule:** one ticket, one branch. Never start a second ticket's work on the same branch.

### 8.2 While you work

- Commit in small, meaningful increments. Use conventional commit messages (`feat: add business profile form`).
- Run the full test suite locally before pushing: `pnpm test && pnpm lint && pnpm typecheck`.
- If Claude Code generated a chunk of code, **read the diff**. Every line. You are accountable for what ships with your name on the commit.
- Push at the end of each work session, even if the work isn't done, so nothing is stuck only on your laptop:
  ```bash
  git push origin feature/O-3-business-profile-setup
  ```

### 8.3 Opening a PR

When the ticket is done:

```bash
gh pr create \
  --title "feat(onboarding): business profile setup (O-3)" \
  --body "Closes O-3. See docs/09-dev-handoff.md Epic 2."
```

Required in the PR body:
- What ticket this closes (`Closes O-3` or `Refs O-3`)
- A one-paragraph description of the change
- Screenshots if the UI changed
- Migration notes if the schema changed
- Any follow-up tickets you discovered (open them in the tracker, link them here)

CI runs. It must pass. If it fails, fix it on the branch — never force-merge a failing PR.

### 8.4 Code review

- At least one human approval before merge. Even on a solo project, self-review after taking a break counts — read your own diff cold the next morning.
- Reviewer checks: matches spec, tests cover the new behavior, no secrets in the diff, no `any` in TypeScript without a comment, migrations are additive (expand, not contract).

### 8.5 Merging

- **Squash and merge** on the PR button. One PR = one commit on `main`. The commit message is the PR title.
- Delete the feature branch after merge (GitHub does this automatically if you turned on the setting — do).
- The `deploy.yml` workflow fires automatically. Watch it in the Actions tab until it turns green.
- Hit `https://app.example.com/healthz` after deploy — 200 means production is live on the new version.

### 8.6 When CI fails

- **Never** merge a red PR by overriding protections. If the branch protection is preventing a legitimate merge, the branch protection is correct and the PR is wrong.
- If a test is flaky, fix the test — don't retry until it passes.
- If a migration fails in CI, the migration is wrong — fix it on the branch and force-push the fix (branch-only, never `main`).

### 8.7 When a deploy fails

- Deploys are idempotent. `deploy.yml` retries on transient failures.
- If a deploy fails on a real bug, the fix is: revert the offending commit on `main` via a new PR, merge it, deploy the revert. **Don't** SSH into the Droplet and edit files. Don't `git reset --hard` on `main`. Revert via a forward commit.
- Every deploy creates an annotated git tag `deploy-YYYY-MM-DD-NNN`. Roll back by deploying the tag before the bad one, not by editing `main`.

### 8.8 Pull cadence

- **Every morning:** `git checkout main && git pull` before starting anything. If your feature branch is behind main, rebase or merge main into it — don't let it rot.
- **Before opening a PR:** rebase on main one more time.
- **After merging your PR:** `git checkout main && git pull` so your local main matches remote.

### 8.9 The `.env` sync rule

If you add a new env var:
1. Add the placeholder to `.env.example` in the same commit.
2. Add the real value to the password manager.
3. Add it to GitHub Actions secrets (if needed at build/deploy time).
4. Add it to the Droplet's `/opt/app/shared/.env` (if needed at runtime).
5. Note it in the PR body so the reviewer knows.

Miss any of these four places and the next person to pull will have a broken local or broken deploy. This is the single most common source of "it works on my machine" pain — enforce all four.

---

## 9. Definition of Done for Setup

The setup phase is done when **every checkbox below is green**:

- [ ] All accounts in Section 1 created and credentials in the password manager
- [ ] Every developer has the local toolchain from Section 2 installed and verified
- [ ] Repo created, structured, protected, with `CLAUDE.md` and `.env.example` committed
- [ ] Droplet live, VPC + firewall + backups on, deploy user works, SSH key-only access
- [ ] Managed Postgres reachable from the Droplet over private VPC
- [ ] Container Registry created, auth works from laptop and Droplet
- [ ] Spaces bucket created, credentials stored
- [ ] Domain DNS points at the Droplet, all subdomains resolve
- [ ] TLS issued for all subdomains, auto-renewal verified with `--dry-run`
- [ ] GitHub Actions secrets populated
- [ ] `ci.yml` and `deploy.yml` workflows present and tested with a hello-world deploy
- [ ] Branch protection requires passing CI before merge
- [ ] Sentry receiving a test error, uptime check pinging `/healthz`, DO alerts configured
- [ ] This doc read by every developer on the project

Once green, open Epic 1 from `09-dev-handoff.md`. The setup phase is over. Building begins.

---

## 10. Troubleshooting Quick Reference

| Symptom | First thing to check |
|---|---|
| `ssh deploy@...` hangs | Cloud Firewall source IP — did you add your current IP to the SSH allow list? |
| `ssh: permission denied` | Is your public key in DO → SSH keys, and was the Droplet created **after** it was added? |
| DNS doesn't resolve | `dig` the hostname — if empty, the A record hasn't propagated. Wait 5 minutes. |
| Certbot fails with "no A record" | DNS hasn't propagated yet. Wait, then re-run. |
| Certbot fails with "too many requests" | Let's Encrypt rate limit — use `--staging` flag while testing, switch to prod once the setup works. |
| Docker pull fails on the Droplet | `doctl registry login` — the token may have expired. Regenerate. |
| GitHub Actions deploy fails SSH step | `DEPLOY_SSH_KEY` secret format — must be the full private key including BEGIN/END lines. |
| `psql` from Droplet to Managed DB fails | Trusted sources — did you add the Droplet (by tag or IP) to the DB's trusted sources list? |
| App can't reach Redis / Postgres | Is the `REDIS_URL` / `DATABASE_URL` using the **private** VPC address, not the public one? |

For anything not on this list: check Sentry, then check `docker logs` on the Droplet, then ask Claude Code with the exact error text.

---

## 11. Sign-off

| Role | Name | Date | ✅ |
|---|---|---|---|
| Technical lead | | | |
| Ops / infra | | | |
| Product | | | |

All three signatures required before Epic 1 begins.
