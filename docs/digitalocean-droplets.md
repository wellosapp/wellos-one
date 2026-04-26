# DigitalOcean Droplets — Platform Reference

**Source:** https://docs.digitalocean.com/products/droplets/
**Last fetched:** April 20, 2026
**Project droplet spec:** 4 vCPU / 8 GB RAM / 80 GB SSD

---

## 1. What a Droplet Is

A DigitalOcean Droplet is a Linux-based virtual machine (VM) running on virtualized hardware. Each Droplet is a standalone server that can be used on its own or composed with other DigitalOcean products (Load Balancers, Managed Databases, Spaces object storage, VPCs, Firewalls) to form a larger cloud infrastructure.

For our booking/payments/SaaS platform (the Mindbody / Vagaro / GlossGenius rebuild scoped in `deep-research-report.md`), a Droplet is the primary compute unit where the application runtime, reverse proxy, and supporting services live. The database itself should typically move off the Droplet onto a DigitalOcean Managed Database once we pass MVP — the Droplet should not be the single point of failure for customer data.

---

## 2. Our Droplet Specification

| Attribute | Value | What it maps to |
|---|---|---|
| vCPU | 4 | Concurrent web/API request throughput, background workers, reverse proxy |
| RAM | 8 GB | Node/PHP/Python process memory, Redis cache, in-memory sessions |
| Disk | 80 GB SSD | OS (~5 GB), logs, app code, Docker images, local uploads, swap |
| Transfer | Included with plan (varies by region) | Outbound bandwidth before metered overage |
| OS (recommended) | Ubuntu 24.04 LTS | Long-term support image with current security patches |

This is the **General Purpose / Basic Premium Intel or AMD tier** range. It is an appropriate size for early production: large enough to run the app, reverse proxy (nginx/Caddy), a Redis instance, and a handful of background workers without being wasteful. It is **not** large enough to also host the primary Postgres at scale — plan to move the database to a Managed Database cluster before we have meaningful customer data.

### Resource Budget Guidance (recommended allocation)

| Component | CPU target | RAM target | Notes |
|---|---|---|---|
| OS + system daemons | 0.25 vCPU | 500 MB | Baseline overhead |
| Reverse proxy (nginx/Caddy) | 0.25 vCPU | 200 MB | TLS termination, static, rate limiting |
| App runtime (web/API) | 2.0 vCPU | 3.5 GB | Main process pool — scale workers to match |
| Background workers | 1.0 vCPU | 1.5 GB | Notifications, webhooks, exports |
| Redis (local, early stage) | 0.25 vCPU | 512 MB | Move to Managed Redis at scale |
| Docker / build headroom | 0.25 vCPU | 500 MB | Keeps deploys from OOM-killing the app |
| Reserved for spikes | — | ~1.3 GB | Never run a Droplet at 100% committed |

If any single component is consistently pegged, that is the signal to either resize vertically or split the workload onto a second Droplet behind a Load Balancer.

---

## 3. Features Included by Default or Recommended

The following features should be enabled when the Droplet is created. Enabling them after the fact requires manual network configuration and a reboot, so it is much easier to turn them on at create time.

| Feature | Why we want it | Cost |
|---|---|---|
| **VPC (private networking)** | Private interface for Droplet ↔ Managed DB, Droplet ↔ Redis, Droplet ↔ Droplet traffic. Reduces bandwidth cost and isolates internal traffic from the public internet. | Free |
| **IPv6** | Adds IPv6 address space. Zero reason to skip. | Free |
| **Monitoring (metrics agent)** | CPU, load, memory, disk, bandwidth graphs + alert policies in the Control Panel. Required to make informed scaling decisions. | Free |
| **Backups** | Automated disk-level snapshots (daily/weekly cadence depending on plan). Our disaster recovery floor — do not disable. | Paid add-on, priced as a % of the Droplet cost |
| **Cloud Firewall** | Stateful firewall applied by Droplet tag. Blocks everything except explicitly allowed ports. See section 5. | Free |
| **SSH key auth only** | No password login to `root`. A sudo non-root user is created via cloud-init user data. See section 4. | Free |

---

## 4. Access and Authentication

Production access rules:

1. **No password login**, ever. SSH keys only. `PermitRootLogin` is set to `prohibit-password` in `sshd_config` at first boot via the cloud-init user-data script.
2. **No day-to-day use of `root`.** A sudo non-root user (`deploy` for our purposes) is created automatically on first boot. All deploys, app restarts, and manual debugging happen as `deploy`.
3. **SSH keys are managed in the DigitalOcean account**, not added manually to `~/.ssh/authorized_keys` on the Droplet. Rotating a key at the account level automatically flows to any new Droplet created with that key attached.
4. **The Droplet Console** (browser-based serial console in the Control Panel) is the only way in if SSH breaks. Treat it as the break-glass path. Set a console/root password in a password manager for that scenario — never for normal use.

### Cloud-init User Data (create-time script)

When creating the Droplet, paste a cloud-config script in the **User Data** field. It should:

- Create a `deploy` sudo user with our SSH key.
- Disable root password login.
- Install baseline packages (`ufw`, `fail2ban`, `curl`, `git`, `docker.io`, `docker-compose-plugin`, `nginx` or `caddy`).
- Configure UFW with the same rules as the Cloud Firewall (defense in depth).
- Configure automatic security updates (`unattended-upgrades`).
- Set a 2 GB swap file (low-priority, safety net only — we don't want the app to rely on swap).

The canonical example script is documented under the "Recommended Droplet Setup" page in DigitalOcean's docs. Our concrete version lives in the repo at `infra/cloud-init/droplet-bootstrap.yml`.

---

## 5. Network and Firewall

### Cloud Firewall Rules (applied by tag `app-web`)

| Direction | Protocol | Port | Source/Destination | Purpose |
|---|---|---|---|---|
| Inbound | TCP | 22 | Your office IP / VPN CIDR only | SSH. Never leave SSH open to `0.0.0.0/0` in production. |
| Inbound | TCP | 80 | `0.0.0.0/0`, `::/0` | HTTP (redirects to HTTPS) |
| Inbound | TCP | 443 | `0.0.0.0/0`, `::/0` | HTTPS |
| Inbound | TCP | 5432 | VPC CIDR only | Postgres (only if DB is on same VPC) |
| Inbound | TCP | 6379 | VPC CIDR only | Redis (only if self-hosted on same VPC) |
| Outbound | TCP/UDP/ICMP | all | `0.0.0.0/0`, `::/0` | Default allow outbound |

UFW on the Droplet itself should mirror the inbound rules above. Two layers is cheap and keeps us safe if the Cloud Firewall is ever misconfigured during a change.

### VPC

All Droplets, Managed Databases, and Load Balancers for this project live in the **same VPC** in the same region. Cross-VPC and public-internet traffic between our own services is not acceptable: it costs bandwidth, leaks metadata, and widens the attack surface.

---

## 6. Storage

- **Root disk (80 GB SSD):** OS, application code, Docker images, logs, small local cache.
- **Volumes (Block Storage):** Attach a DigitalOcean Volume for anything that needs to outlive a Droplet rebuild — user uploads during MVP, persistent database data if self-hosting a DB early on. Volumes can be detached and reattached to a new Droplet, which makes recovery and resize much easier.
- **Spaces (object storage, S3-compatible):** The correct home for user-uploaded files (client photos, SOAP note attachments, waivers, branded-app assets) once we move past MVP. Do not accumulate GB of user media on the root disk.

### Disk Budget on an 80 GB Droplet

| Allocation | Size | Notes |
|---|---|---|
| OS and system | ~6 GB | Ubuntu + system services |
| Docker images + build cache | ~15 GB | Prune weekly with `docker system prune` |
| App code + dependencies | ~5 GB | Deploys, node_modules, virtualenvs |
| Logs (journald + app logs) | ~10 GB | Rotate aggressively; ship to a log service if possible |
| Swap file | 2 GB | Safety net |
| User uploads (MVP only) | up to 20 GB | Move to Spaces before this gets tight |
| Headroom | ~20 GB | Never fill past 80% |

Disk full on a production Droplet is one of the most common causes of self-inflicted outages. Monitoring has a free "disk usage > 85%" alert — turn it on.

---

## 7. Scaling Paths

The 4 vCPU / 8 GB / 80 GB Droplet is sized for MVP and early production, not for sustained 24/7 heavy load. Scaling options in rough order of preference:

1. **Resize vertically.** DigitalOcean supports in-place Droplet resize. "CPU + RAM only" resizes are reversible (you can size back down); "CPU + RAM + disk" resizes are permanent (disk grows only, never shrinks). Start with the reversible option when in doubt.
2. **Offload the database.** Move Postgres and Redis to DigitalOcean Managed Databases. This recovers 1–2 GB of RAM and removes the hardest thing to recover on the Droplet.
3. **Add a Load Balancer + horizontal pool.** Put two or more identical Droplets behind a DigitalOcean Load Balancer. Requires the app to be stateless (sessions in Redis/DB, uploads in Spaces, no local file writes that matter).
4. **Move to App Platform or Kubernetes.** Only once we have a real team and real traffic. Droplets are a better fit until then — less cost, less moving parts, easier to debug.

Do not skip step 2. A Droplet that also hosts the production database is a single point of failure and blocks every other scaling move.

---

## 8. Monitoring and Alerts

The Monitoring agent (free, installed via the metrics option at create time) gives us Control Panel graphs for CPU, load, memory, disk, and bandwidth. Turn on alert policies for at least:

- CPU > 80% for 10 minutes.
- Memory usage > 85% for 5 minutes.
- Disk usage > 85%.
- Droplet unreachable (public monitoring check).
- Outbound bandwidth unusually high (helps catch compromised or misbehaving workloads).

Alerts go to an email group and/or a Slack webhook. Do not send production alerts to a single person's inbox.

Application-level metrics (request latency, error rate, job backlog) are a separate concern and live in our APM layer (Sentry, a self-hosted Grafana stack, or a managed APM). The DigitalOcean metrics agent only knows about the Droplet, not about our app.

---

## 9. Backups and Recovery

- **DigitalOcean Backups (paid add-on):** Enabled. Daily or weekly automated image of the full Droplet. Good for "the whole Droplet is on fire" recovery.
- **Snapshots:** Manual point-in-time images. Take one before any risky operation (OS upgrade, major deploy, kernel update). Cheap insurance.
- **Database backups:** Separate and non-negotiable. If we move Postgres to Managed Databases, daily backups + PITR are included. If we self-host, `pg_dump` on a cron to Spaces with at least 14 days of retention is the floor.
- **Configuration in version control:** All server configuration (nginx, systemd units, cloud-init) lives in the repo. No snowflake config on the Droplet that we can't rebuild from git.

The recovery test — spinning up a fresh Droplet from cloud-init and restoring data from the latest backup — should be run at least once per quarter. A backup you have never restored is not a backup.

---

## 10. Pricing Notes

Pricing changes. Do not hardcode dollar amounts in this doc. Check the live pricing page before budgeting:

https://docs.digitalocean.com/products/droplets/details/pricing/

The three line items that add up to the monthly spend are:

1. **Droplet base price** (based on the 4 vCPU / 8 GB / 80 GB size and the CPU family: Regular, Premium Intel, or Premium AMD).
2. **Backups add-on** (a percentage of the Droplet cost, typically ~20%).
3. **Bandwidth overage** (only if we exceed the included transfer allowance).

Managed Databases, Load Balancers, Spaces, and Volumes are billed separately.

---

## 11. Important Limitations

- **SMTP outbound is blocked by default** on new accounts. This is anti-spam policy, not a technical restriction we can toggle ourselves. Use a transactional email provider (Postmark, SendGrid, Mailgun, Resend) for all system-generated email. Do not attempt to run our own outbound SMTP server from a Droplet.
- **No nested virtualization.** Fine for Docker; not fine for running VMs inside the Droplet.
- **One public IPv4 per Droplet.** If we need multiple, use a Reserved IP or a Load Balancer.

---

## 12. References

- Droplets product overview: https://docs.digitalocean.com/products/droplets/
- Recommended Droplet Setup: https://docs.digitalocean.com/products/droplets/getting-started/recommended-droplet-setup/
- How to create a Droplet: https://docs.digitalocean.com/products/droplets/how-to/create/
- Add SSH keys: https://docs.digitalocean.com/products/droplets/how-to/add-ssh-keys/
- Cloud Firewalls: https://docs.digitalocean.com/products/networking/firewalls/
- Droplet pricing: https://docs.digitalocean.com/products/droplets/details/pricing/
- Why SMTP is blocked: https://docs.digitalocean.com/support/why-is-smtp-blocked/
