# Supabase RLS policies

Placeholder. Row-Level Security policies for the foundation tables land in a
follow-up PR (Epic 1, sub-step 4 — when Clerk wiring decides how the user ID
flows from the JWT into Postgres).

## Why deferred

At MVP the API talks to Supabase through the **service role key**, which
bypasses RLS. The security model today is: every query goes through
application-layer tenant scoping (Prisma + `tenant_id` filters). RLS becomes
the safety net the moment any frontend or third-party tool talks to Supabase
directly with the publishable key — that is not yet the case.

## What goes here

`.sql` files, one per table or grouping (e.g. `tenants.sql`, `users.sql`).
Applied via the Supabase CLI or pasted into Supabase Studio. Each file should:

1. `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;`
2. Define policies for `SELECT`, `INSERT`, `UPDATE`, `DELETE` keyed on the
   Clerk user's tenant (resolved via a custom JWT claim — finalized in the
   Clerk wiring PR).

## Reference

- `docs/CLAUDE.md` §4 hard rule #7 — multi-tenant from day one, RLS on every tenant-owned table.
- `docs/wellos-studio-start-plan.md` "Database Setup" — table list.
