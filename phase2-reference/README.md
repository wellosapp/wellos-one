# Phase 2 Reference

**Do not use these files in MVP.** They are preserved here as the migration playbook for when the project moves off the managed-PaaS stack (Railway / Supabase / Upstash / Vercel) onto self-hosted DigitalOcean Droplets.

The migration triggers are documented in [`../docs/00-V2-per-build-setup.md`](../docs/00-V2-per-build-setup.md) Appendix A. In short:

1. Railway compute bill exceeds ~$80/month sustained
2. Railway hits a limitation we can't work around (custom kernel, specific networking, static outbound IP for Stripe Terminal)
3. Multi-region deployment becomes a requirement
4. Compliance requires VM-level control

## What's in here

| Path | What it is | Used by |
|---|---|---|
| `cloud-init/instance-bootstrap.sh` | Droplet provisioning script — creates `deploy` user, installs Docker + nginx, configures UFW, sets up unattended-upgrades, creates 2 GB swap | DigitalOcean Droplet creation per `../docs/digitalocean-droplets.md` |
| `migrations/002_payments_full.sql` | Original raw-SQL payments schema (v1 / Drizzle path). Will be ported to Prisma migrations under `/prisma/migrations/` during Epic 5 (Payments). Kept here verbatim until that port is reviewed. | Reference for porting |

## Related docs (in `../docs/`)

- `00-pre-build-setup.md` — superseded v1 setup (DO Droplet path)
- `digitalocean-droplets.md` — Droplet configuration details
- `digitalocean-api.md` — programmatic DO access via `doctl`
- `push-to-production.md` — DO deploy pipeline (`deploy.yml`)
- `00-V2-per-build-setup.md` Appendix A — the migration playbook itself
