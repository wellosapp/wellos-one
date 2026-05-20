-- Epic 7 Phase 5 — staff ICS subscribe token (hashed at rest).
CREATE TABLE "staff_calendar_feed_tokens" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_calendar_feed_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_calendar_feed_tokens_staff_id_key" ON "staff_calendar_feed_tokens"("staff_id");

CREATE UNIQUE INDEX "staff_calendar_feed_tokens_token_hash_key" ON "staff_calendar_feed_tokens"("token_hash");

CREATE INDEX "staff_calendar_feed_tokens_tenant_id_idx" ON "staff_calendar_feed_tokens"("tenant_id");

ALTER TABLE "staff_calendar_feed_tokens" ADD CONSTRAINT "staff_calendar_feed_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff_calendar_feed_tokens" ADD CONSTRAINT "staff_calendar_feed_tokens_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
