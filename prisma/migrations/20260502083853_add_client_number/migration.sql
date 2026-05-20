-- Add a per-tenant sequential client number for support / phone-lookup
-- workflows. Rendered as `CL-{6-digit zero-padded}` in the admin UI.
-- Sequential per tenant — tenant A's first client and tenant B's first
-- client both get number 1; never visible across tenants.
--
-- Three-step migration: add nullable column, backfill existing rows by
-- creation order per tenant, then make the column NOT NULL with a
-- per-tenant unique constraint.

-- 1. Add the column nullable so backfill can populate it.
ALTER TABLE "clients" ADD COLUMN "client_number" INTEGER;

-- 2. Backfill: assign sequential numbers ordered by created_at (then id
--    as a tiebreaker for clients created in the same millisecond),
--    partitioned by tenant. New tenants start at 1; this preserves the
--    intuitive "first client = 1" property within each tenant.
WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM "clients"
)
UPDATE "clients" c
SET client_number = n.rn
FROM numbered n
WHERE c.id = n.id;

-- 3. Make the column required + unique per tenant. Future Client.create
--    in clientService computes MAX(client_number) + 1 inside the
--    transaction; the unique constraint catches any race-window collision
--    so the service layer can retry once.
ALTER TABLE "clients" ALTER COLUMN "client_number" SET NOT NULL;

CREATE UNIQUE INDEX "clients_tenant_id_client_number_key"
  ON "clients"("tenant_id", "client_number");
