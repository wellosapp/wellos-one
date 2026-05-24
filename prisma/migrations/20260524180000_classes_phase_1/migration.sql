-- Phase 1 of the Classes epic: catalog templates only.
-- ClassInstance (per-occurrence rows), ClassBooking, ClassWaitlistEntry,
-- and check-in tables are Phase 2-4. This migration only ships the
-- Class template + class_instructors M2M.

CREATE TABLE "classes" (
  "id" TEXT PRIMARY KEY,
  "tenant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "short_description" TEXT,
  "long_description" TEXT,
  "duration_minutes" INTEGER NOT NULL,
  "base_price_cents" INTEGER NOT NULL DEFAULT 0,
  "max_capacity" INTEGER NOT NULL,
  "min_to_run" INTEGER NOT NULL DEFAULT 1,
  "allow_waitlist" BOOLEAN NOT NULL DEFAULT false,
  "waitlist_limit" INTEGER NOT NULL DEFAULT 0,
  "color" TEXT,
  "buffer_before_minutes" INTEGER NOT NULL DEFAULT 0,
  "buffer_after_minutes" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "category_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "classes_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id") ON DELETE RESTRICT,
  CONSTRAINT "classes_category_id_fkey" FOREIGN KEY ("category_id")
    REFERENCES "service_categories"("id") ON DELETE SET NULL
);

CREATE INDEX "classes_tenant_id_idx" ON "classes" ("tenant_id");
CREATE INDEX "classes_tenant_id_category_id_idx" ON "classes" ("tenant_id", "category_id");
CREATE INDEX "classes_tenant_id_active_idx" ON "classes" ("tenant_id", "active");
CREATE INDEX "classes_deleted_at_idx" ON "classes" ("deleted_at");

CREATE TABLE "class_instructors" (
  "id" TEXT PRIMARY KEY,
  "class_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "class_instructors_class_id_fkey" FOREIGN KEY ("class_id")
    REFERENCES "classes"("id") ON DELETE CASCADE,
  CONSTRAINT "class_instructors_staff_id_fkey" FOREIGN KEY ("staff_id")
    REFERENCES "staff"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "class_instructors_class_id_staff_id_key"
  ON "class_instructors" ("class_id", "staff_id");
CREATE INDEX "class_instructors_staff_id_idx" ON "class_instructors" ("staff_id");
