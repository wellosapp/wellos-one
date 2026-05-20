-- Services & Catalog: lock list price on the appointment at creation time.
ALTER TABLE "appointments" ADD COLUMN "booked_base_price_cents" INTEGER;

UPDATE "appointments" AS a
SET "booked_base_price_cents" = s."base_price_cents"
FROM "services" AS s
WHERE s."id" = a."service_id";

-- Defensive: any row without a service match (should not happen) uses 0.
UPDATE "appointments" SET "booked_base_price_cents" = 0 WHERE "booked_base_price_cents" IS NULL;

ALTER TABLE "appointments" ALTER COLUMN "booked_base_price_cents" SET NOT NULL;
