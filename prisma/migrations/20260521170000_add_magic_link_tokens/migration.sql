-- Magic-link tokens for the public unauthenticated client surface
-- (docs/04-booking-flow.md Flow D/E + Client Recognition). Adds:
--   * MagicLinkPurpose enum (manage_booking, claim_account)
--   * magic_link_tokens table with sliding 24h expiry semantics
--     (expiresAt advances on every successful open; lastUsedAt
--      is informational; revokedAt kills the token regardless)
--   * Indexes for tenant scoping + appointment/client lookups +
--     a sweep index on expiresAt for the future cleanup job

-- CreateEnum
CREATE TYPE "MagicLinkPurpose" AS ENUM ('manage_booking', 'claim_account');

-- CreateTable
CREATE TABLE "magic_link_tokens" (
    "id"              TEXT            NOT NULL,
    "tenant_id"       TEXT            NOT NULL,
    "token"           TEXT            NOT NULL,
    "purpose"         "MagicLinkPurpose" NOT NULL,
    "appointment_id"  TEXT,
    "client_id"       TEXT,
    "recipient_email" TEXT            NOT NULL,
    "issued_at"       TIMESTAMPTZ(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at"      TIMESTAMPTZ(3)  NOT NULL,
    "last_used_at"    TIMESTAMPTZ(3),
    "revoked_at"      TIMESTAMPTZ(3),
    "revoked_reason"  TEXT,

    CONSTRAINT "magic_link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique token across all tenants — public route looks up by token alone)
CREATE UNIQUE INDEX "magic_link_tokens_token_key" ON "magic_link_tokens"("token");

-- CreateIndex
CREATE INDEX "magic_link_tokens_tenant_id_idx" ON "magic_link_tokens"("tenant_id");

-- CreateIndex
CREATE INDEX "magic_link_tokens_appointment_id_idx" ON "magic_link_tokens"("appointment_id");

-- CreateIndex
CREATE INDEX "magic_link_tokens_client_id_idx" ON "magic_link_tokens"("client_id");

-- CreateIndex (for periodic cleanup of expired tokens — Phase-2 BullMQ job)
CREATE INDEX "magic_link_tokens_expires_at_idx" ON "magic_link_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "magic_link_tokens"
  ADD CONSTRAINT "magic_link_tokens_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "magic_link_tokens"
  ADD CONSTRAINT "magic_link_tokens_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "magic_link_tokens"
  ADD CONSTRAINT "magic_link_tokens_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
