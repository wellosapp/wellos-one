# DigitalOcean API — Reference for Our Platform

**Source:** https://docs.digitalocean.com/reference/api/reference/
**Last fetched:** April 20, 2026
**Base URL:** `https://api.digitalocean.com/v2/`
**OpenAPI spec:** https://github.com/digitalocean/openapi

---

## 1. Why We Care About the API

The DigitalOcean API exposes everything the Control Panel can do, programmatically. For our platform this matters in four specific places:

1. **Infrastructure as code.** We do not want production infra to exist only as clicks in a dashboard. Terraform and `doctl` both hit this API underneath, so the API is the contract we're ultimately relying on.
2. **CI/CD.** Our deploy pipeline (see `push-to-production.md`) authenticates with an API token to pull images from the Container Registry, tag Droplets, and — later — trigger Load Balancer updates or App Platform deploys.
3. **Automated snapshots + backups** before risky changes, scripted from a release job.
4. **Future tenant provisioning.** If we ever offer dedicated-infra tiers to enterprise customers, spinning up an isolated Droplet/DB/Volume set is an API-driven workflow.

---

## 2. Authentication

### Personal Access Tokens

All requests authenticate via a Bearer token in the `Authorization` header:

```
Authorization: Bearer <DIGITALOCEAN_TOKEN>
```

Tokens are generated at https://cloud.digitalocean.com/account/api/tokens. Every token has:

- A **name** — use a name that identifies where it's used (`ci-deploy`, `terraform-prod`, `monitoring-bot`). Never a generic name like `token1`.
- An **expiration** — always set one. Never generate a non-expiring token for production use.
- **Scopes** — newer tokens support fine-grained read/write scopes per resource category (Droplets, Databases, Spaces, etc.). Use the narrowest scope that works. A CI deploy token does not need access to Billing.

### Token Handling Rules

1. Never commit tokens to git. If one is ever leaked, revoke it in the Control Panel **immediately** — revocation is the only way to invalidate a token.
2. Store CI tokens in the CI provider's encrypted secrets store (GitHub Actions secrets, GitLab CI variables masked + protected). Never in plain config.
3. Rotate tokens on a schedule: every 90 days for CI tokens, every 365 days for long-lived read-only tokens, immediately on any team-member departure.
4. One token per purpose. If CI, Terraform, and a monitoring bot all share one token, revoking it means all three break at once. Separate tokens limit blast radius.

### OAuth

DigitalOcean also supports an OAuth API for applications that act on behalf of other DO users. We do not need this for our own infrastructure — it's only relevant if we ever build a product feature that provisions DO resources inside a customer's own DO account.

---

## 3. Request Conventions

All requests are HTTPS. Methods follow REST conventions:

| Method | Use |
|---|---|
| `GET` | Read resources. Idempotent, safe. |
| `POST` | Create resources. Body is a JSON object with attributes. |
| `PUT` | Replace a resource's state. Idempotent. |
| `PATCH` | Partial update. Only send the fields you want to change. |
| `DELETE` | Destroy a resource. Idempotent — deleting something that's already gone still returns success. |
| `HEAD` | Get headers only (rate-limit info, pagination metadata). |

### Request Body (create / update)

Send JSON, and tell the server you're sending JSON:

```bash
curl -X POST "https://api.digitalocean.com/v2/droplets" \
  -H "Authorization: Bearer $DIGITALOCEAN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "app-prod-01",
    "region": "nyc3",
    "size": "s-4vcpu-8gb",
    "image": "ubuntu-24-04-x64",
    "ssh_keys": [12345678],
    "backups": true,
    "ipv6": true,
    "monitoring": true,
    "vpc_uuid": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "tags": ["app-web", "env:prod"],
    "user_data": "#cloud-config\n..."
  }'
```

Note the **size slug**: `s-4vcpu-8gb` is the basic shared-CPU size that matches our 4 vCPU / 8 GB / 80 GB spec. For Premium Intel or Premium AMD variants, the slug changes (`s-4vcpu-8gb-intel`, `s-4vcpu-8gb-amd`, etc.). Always confirm the current slug with `GET /v2/sizes` before scripting.

### Filter Parameters (read)

Filters go on the query string:

```bash
curl -X GET "https://api.digitalocean.com/v2/droplets?tag_name=app-web" \
  -H "Authorization: Bearer $DIGITALOCEAN_TOKEN"
```

---

## 4. Responses

### Success

A successful response is a JSON object keyed by the resource name:

```json
{ "droplet": { "id": 12345678, "name": "app-prod-01", ... } }
```

…for a single resource, or the plural form for a collection:

```json
{ "droplets": [ { "id": 12345678, ... }, { "id": 12345679, ... } ] }
```

`DELETE` returns `204 No Content` with an empty body — success means "it's gone (or was already gone)."

### Errors

Error responses (4xx, 5xx) return a JSON object:

```json
{
  "id": "forbidden",
  "message": "You do not have access for the attempted action.",
  "request_id": "abc123..."
}
```

When opening a support ticket about a failed API call, **always include the `request_id`**. It's the fastest way for DO support to find the call in their logs.

### Status Code Categories

- `2xx` — success.
- `4xx` — our fault. Malformed request, bad auth, insufficient scope, resource doesn't exist, or business-rule violation (e.g. trying to resize a Droplet while it's locked by another action).
- `5xx` — DigitalOcean's fault. Retry with exponential backoff. If it persists, check https://status.digitalocean.com before assuming it's our code.

---

## 5. Pagination

Collection endpoints return 20 items per page by default, maximum 200 per page via `?per_page=200`. Responses include a `links` object and a `meta` object:

```json
{
  "droplets": [ ... ],
  "links": {
    "pages": {
      "next": "https://api.digitalocean.com/v2/droplets?page=2",
      "last": "https://api.digitalocean.com/v2/droplets?page=5"
    }
  },
  "meta": { "total": 87 }
}
```

Rules for pagination in our code:

- Always paginate through to the end. Do not assume the first page is all there is.
- Follow `links.pages.next` rather than manually incrementing `?page=N` — this way the server controls the pagination, and it keeps working if defaults change.
- Use `?per_page=200` for bulk listing operations. Fewer requests, less rate-limit pressure.

---

## 6. Rate Limits

Per-token limits:

- **5,000 requests per hour.**
- **250 requests per minute** (burst cap — hit this and you can be throttled even if you're under the hourly limit).

Every response includes rate-limit headers:

| Header | Meaning |
|---|---|
| `ratelimit-limit` | The per-hour limit (5000). |
| `ratelimit-remaining` | Requests left before you're throttled. |
| `ratelimit-reset` | Unix epoch time when the oldest request in your window expires. |
| `retry-after` | Seconds to wait (only sent when you've been throttled). |

When throttled, the API returns:

```
HTTP/1.1 429 Too Many Requests
{ "id": "too_many_requests", "message": "API Rate limit exceeded." }
```

### Our Rules

1. **Respect `retry-after`**. On a 429, sleep for the returned number of seconds (plus a small jitter) before retrying. Do not immediately hammer.
2. **Exponential backoff on 5xx**. Start at 1 second, double up to a 60-second cap, with jitter. Give up after ~5 minutes and surface the error.
3. **Don't poll tight loops.** When waiting for an action (like a Droplet create) to complete, poll at 5–10 second intervals, not 500 ms. Use HEAD requests where you only need status, not body.
4. **Special cases to watch:**
   - `GET /v2/account/keys` — only 10 requests per 60 seconds.
   - `/v2/cdn/endpoints` — only 5 requests per 10 seconds.
   These are much tighter than the general limit. If a job iterates SSH keys or CDN endpoints, throttle the job explicitly.

---

## 7. Endpoint Categories We'll Use

The full API surface is huge (500+ endpoints across ~50 categories). We don't need all of it. The ones we'll actually interact with for this project:

| Category | Endpoints we'll touch | Why |
|---|---|---|
| **Droplets** | `POST /v2/droplets`, `GET /v2/droplets`, `GET /v2/droplets/{id}`, `DELETE /v2/droplets/{id}` | Provision, list, destroy app servers. |
| **Droplet Actions** | `POST /v2/droplets/{id}/actions` | Power cycle, resize, snapshot, rebuild. |
| **Snapshots** | `GET /v2/snapshots`, `DELETE /v2/snapshots/{id}` | Manage point-in-time images, prune old ones. |
| **SSH Keys** | `GET /v2/account/keys` | Look up key fingerprints when provisioning. |
| **Firewalls** | `POST /v2/firewalls`, `PUT /v2/firewalls/{id}` | Define and update inbound rules by tag. |
| **Tags** | `POST /v2/tags`, `POST /v2/tags/{name}/resources` | Group Droplets so firewalls and monitoring apply automatically. |
| **VPCs** | `GET /v2/vpcs` | Look up the VPC UUID when placing Droplets in our private network. |
| **Regions / Sizes / Images** | `GET /v2/regions`, `GET /v2/sizes`, `GET /v2/images` | Confirm current slugs before scripting — these do change. |
| **Databases** | `POST /v2/databases`, `GET /v2/databases/{id}` | Managed Postgres for our primary data store. |
| **Load Balancers** | `POST /v2/load_balancers` | Once we scale to more than one Droplet. |
| **Container Registry** | `GET /v2/registry`, `GET /v2/registry/{name}/repositories` | CI pushes Docker images here; Droplet pulls them. |
| **Spaces Keys** | `POST /v2/spaces/keys` | Access keys for object storage used for user uploads. |
| **Monitoring** | `POST /v2/monitoring/alerts` | Create alert policies programmatically. |
| **Account** | `GET /v2/account` | Smoke test a new token — cheapest possible call. |

Full endpoint index: https://docs.digitalocean.com/reference/api/reference/

---

## 8. Tooling on Top of the API

Rarely do we hit the raw API with `curl` outside of one-off debugging. Preferred tools, in order:

1. **`doctl`** — DigitalOcean's official CLI. Wraps the API, handles auth contexts, good for ad-hoc ops work and CI scripts. `doctl auth init --context prod`, then `doctl compute droplet list`, etc.
2. **Terraform** — For all persistent infra (Droplets, firewalls, VPCs, DBs, DNS records). The DigitalOcean provider maps cleanly onto these endpoints. State lives in a DO Spaces bucket with a state lock.
3. **PyDo / godo** — Python and Go client libraries, respectively. Used only if we're building tooling that needs to live inside our app (tenant provisioning, scheduled cleanup jobs).
4. **Raw HTTP** — Last resort. If the CLI and Terraform can do it, use them.

---

## 9. CORS

The API supports CORS so browser-based tools can call it directly. We don't use this — our app never calls the DO API from a browser. All DO API traffic originates from our backend, CI, or ops laptops. If you find yourself tempted to put a DO token in frontend code, stop and reconsider.

---

## 10. References

- API overview: https://docs.digitalocean.com/reference/api/reference/
- Create a personal access token: https://docs.digitalocean.com/reference/api/create-personal-access-token/
- Token scopes: https://docs.digitalocean.com/reference/api/scopes/
- OpenAPI spec (GitHub): https://github.com/digitalocean/openapi
- `doctl` CLI reference: https://docs.digitalocean.com/reference/doctl/
- Terraform provider: https://registry.terraform.io/providers/digitalocean/digitalocean/latest/docs
- PyDo (Python): https://pydo.readthedocs.io/
- godo (Go): https://github.com/digitalocean/godo
- DigitalOcean status page: https://status.digitalocean.com/
