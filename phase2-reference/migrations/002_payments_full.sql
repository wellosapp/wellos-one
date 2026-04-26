-- ============================================================
-- Migration 002: Payments, checkout, and ledger — full build
--
-- Assumes migration 001 created the base schema with composite
-- primary keys on tenant-scoped tables: (id, tenant_id).
-- All FKs here use composite refs to enforce tenant isolation.
--
-- Changes from the draft schema:
--   1. location_id added to carts, payments, client_memberships, gift_cards
--   2. payments.amount now signed (+ charge, - refund). refund_amount dropped.
--   3. sales table introduced to group payments post-checkout
--   4. payouts table for Stripe Connect reconciliation
--   5. deposits flow: appointments carry a deposit_payment_id
--   6. cart_item_taxes + cart_item_discounts for per-line breakdowns
--   7. promo_code_redemptions replaces uses_count counter
--   8. membership_redemptions + gift_card_redemptions for atomic ledgers
--   9. RLS policies on every tenant-scoped table
--  10. Indexes for every hot path
-- ============================================================

-- ------------------------------------------------------------
-- 1. Drop old constraints / columns we're replacing
-- ------------------------------------------------------------

-- Old payments.refund_amount is redundant with signed amount + type
ALTER TABLE payments DROP COLUMN IF EXISTS refund_amount;

-- Old promo_codes.uses_count becomes a view over redemptions
ALTER TABLE promo_codes DROP COLUMN IF EXISTS uses_count;


-- ------------------------------------------------------------
-- 2. location_id on tenant-scoped commerce tables
-- ------------------------------------------------------------

ALTER TABLE carts
  ADD COLUMN location_id UUID NOT NULL REFERENCES locations(id),
  ADD CONSTRAINT carts_location_tenant_fk
    FOREIGN KEY (location_id, tenant_id) REFERENCES locations(id, tenant_id);

ALTER TABLE payments
  ADD COLUMN location_id UUID NOT NULL REFERENCES locations(id),
  ADD CONSTRAINT payments_location_tenant_fk
    FOREIGN KEY (location_id, tenant_id) REFERENCES locations(id, tenant_id);

ALTER TABLE client_memberships
  ADD COLUMN location_id UUID REFERENCES locations(id),  -- NULL allowed: memberships can span locations
  ADD CONSTRAINT client_memberships_location_tenant_fk
    FOREIGN KEY (location_id, tenant_id) REFERENCES locations(id, tenant_id);

ALTER TABLE gift_cards
  ADD COLUMN location_id UUID REFERENCES locations(id),   -- NULL = redeemable at any location
  ADD CONSTRAINT gift_cards_location_tenant_fk
    FOREIGN KEY (location_id, tenant_id) REFERENCES locations(id, tenant_id);


-- ------------------------------------------------------------
-- 3. payments.amount is now signed
-- ------------------------------------------------------------
-- Convention:
--   charge, deposit, no_show_fee         -> positive amount
--   refund, partial_refund               -> negative amount
--   tip_amount is always positive and tracked separately
--
-- A sale's net revenue = SUM(amount + tip_amount) across its payments
-- where status = 'succeeded'.
-- ------------------------------------------------------------

COMMENT ON COLUMN payments.amount IS
  'Signed gross movement. Positive for charge/deposit/fee, negative for refund. Tip tracked separately in tip_amount.';


-- ------------------------------------------------------------
-- 4. sales — the post-checkout grouping concept
-- ------------------------------------------------------------
-- A cart becomes a sale when it's completed. Payments attach to the sale,
-- not the cart. This is what reconciliation, receipts, and reporting query.
-- ------------------------------------------------------------

CREATE TABLE sales (
  id                UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id       UUID NOT NULL,
  cart_id           UUID NOT NULL,
  client_id         UUID NOT NULL,
  sale_number       BIGINT NOT NULL,                        -- Human-readable per-tenant sequence
  status            TEXT NOT NULL DEFAULT 'completed',      -- 'completed' | 'voided' | 'disputed'

  -- Frozen totals at time of sale (never recompute — cart_items can change after)
  subtotal          DECIMAL(10,2) NOT NULL,
  discount_total    DECIMAL(10,2) NOT NULL DEFAULT 0,
  tax_total         DECIMAL(10,2) NOT NULL DEFAULT 0,
  tip_total         DECIMAL(10,2) NOT NULL DEFAULT 0,
  grand_total       DECIMAL(10,2) NOT NULL,

  -- Running balance. Updated by trigger when payments are inserted.
  -- amount_paid = SUM(succeeded payments.amount + tip_amount)
  -- balance_due = grand_total - amount_paid (can be negative if over-refunded, which should alert)
  amount_paid       DECIMAL(10,2) NOT NULL DEFAULT 0,
  balance_due       DECIMAL(10,2) NOT NULL DEFAULT 0,

  voided_at         TIMESTAMPTZ,
  voided_reason     TEXT,
  voided_by_user_id UUID REFERENCES users(id),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id, tenant_id),
  UNIQUE (tenant_id, sale_number),
  FOREIGN KEY (location_id, tenant_id) REFERENCES locations(id, tenant_id),
  FOREIGN KEY (cart_id, tenant_id)     REFERENCES carts(id, tenant_id),
  FOREIGN KEY (client_id, tenant_id)   REFERENCES clients(id, tenant_id)
);

-- Per-tenant sale number sequence. A function helper, not a global sequence,
-- so tenants can have sale_number 1, 2, 3 without collision.
CREATE TABLE tenant_sequences (
  tenant_id     UUID NOT NULL,
  sequence_name TEXT NOT NULL,
  next_value    BIGINT NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, sequence_name)
);

-- payments now points to a sale, not (only) a cart.
-- cart_id is kept for pre-sale payments (deposits taken before the sale exists).
ALTER TABLE payments
  ADD COLUMN sale_id UUID,
  ADD CONSTRAINT payments_sale_tenant_fk
    FOREIGN KEY (sale_id, tenant_id) REFERENCES sales(id, tenant_id);


-- ------------------------------------------------------------
-- 5. payouts — Stripe Connect / gateway settlement tracking
-- ------------------------------------------------------------

CREATE TABLE payouts (
  id                  UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id         UUID NOT NULL,
  gateway_id          UUID NOT NULL,

  provider            TEXT NOT NULL,                        -- 'stripe' | 'square' | ...
  external_payout_ref TEXT NOT NULL,                        -- Stripe payout_id
  status              TEXT NOT NULL,                        -- 'pending' | 'in_transit' | 'paid' | 'failed' | 'cancelled'

  gross_amount        DECIMAL(10,2) NOT NULL,               -- Total charged
  fees_amount         DECIMAL(10,2) NOT NULL DEFAULT 0,     -- Processor fees
  refunds_amount      DECIMAL(10,2) NOT NULL DEFAULT 0,     -- Refunds deducted
  net_amount          DECIMAL(10,2) NOT NULL,               -- What hit the bank
  currency            TEXT NOT NULL DEFAULT 'USD',

  arrival_date        DATE,
  bank_last4          TEXT,
  provider_response   JSONB,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id, tenant_id),
  UNIQUE (provider, external_payout_ref),
  FOREIGN KEY (location_id, tenant_id) REFERENCES locations(id, tenant_id),
  FOREIGN KEY (gateway_id, tenant_id)  REFERENCES payment_gateways(id, tenant_id)
);

-- Link each payment to the payout that settled it (populated async by reconciliation job)
ALTER TABLE payments
  ADD COLUMN payout_id UUID,
  ADD CONSTRAINT payments_payout_tenant_fk
    FOREIGN KEY (payout_id, tenant_id) REFERENCES payouts(id, tenant_id);


-- ------------------------------------------------------------
-- 6. Deposits & no-show fees
-- ------------------------------------------------------------
-- Deposits are taken at booking time, before any cart exists.
-- They live as payments (type='deposit') with sale_id=NULL.
-- When the appointment completes and becomes a sale, the deposit
-- payment gets sale_id populated and is counted toward amount_paid.
-- ------------------------------------------------------------

ALTER TABLE appointments
  ADD COLUMN deposit_required_amount DECIMAL(10,2),        -- Set when booking rule requires deposit
  ADD COLUMN deposit_payment_id UUID,                       -- FK to the payment row that captured it
  ADD CONSTRAINT appointments_deposit_payment_tenant_fk
    FOREIGN KEY (deposit_payment_id, tenant_id) REFERENCES payments(id, tenant_id);

-- No-show fee policy on services. Enforced by booking engine at no-show marking time.
ALTER TABLE services
  ADD COLUMN no_show_fee_amount DECIMAL(10,2),
  ADD COLUMN no_show_fee_percent DECIMAL(5,2),             -- Either flat or percent; app enforces "only one"
  ADD COLUMN late_cancel_hours INTEGER,                    -- Cancel within N hours = fee applies
  ADD COLUMN deposit_required_amount DECIMAL(10,2),
  ADD COLUMN deposit_required_percent DECIMAL(5,2);


-- ------------------------------------------------------------
-- 7. Per-line taxes and discounts on cart items
-- ------------------------------------------------------------

-- Tax rates are configured per location (different states, different rules)
CREATE TABLE tax_rates (
  id           UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  location_id  UUID,                                       -- NULL = tenant default
  name         TEXT NOT NULL,                              -- 'CA State Sales Tax'
  rate_percent DECIMAL(6,4) NOT NULL,                      -- 7.2500
  applies_to   TEXT NOT NULL,                              -- 'services' | 'products' | 'all'
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,

  PRIMARY KEY (id, tenant_id),
  FOREIGN KEY (location_id, tenant_id) REFERENCES locations(id, tenant_id)
);

-- Per-line tax breakdown — one row per tax applied to one cart item
CREATE TABLE cart_item_taxes (
  id            UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cart_item_id  UUID NOT NULL,
  tax_rate_id   UUID NOT NULL,
  tax_name      TEXT NOT NULL,                             -- Frozen name at time of sale
  rate_percent  DECIMAL(6,4) NOT NULL,                     -- Frozen rate at time of sale
  taxable_amount DECIMAL(10,2) NOT NULL,                   -- What the rate was applied to
  tax_amount    DECIMAL(10,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id, tenant_id),
  FOREIGN KEY (cart_item_id, tenant_id) REFERENCES cart_items(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (tax_rate_id, tenant_id)  REFERENCES tax_rates(id, tenant_id)
);

-- Per-line discount breakdown — tracks which promo/discount applied to which line
CREATE TABLE cart_item_discounts (
  id               UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cart_item_id     UUID NOT NULL,
  source_type      TEXT NOT NULL,                          -- 'promo_code' | 'membership' | 'manual' | 'package'
  promo_code_id    UUID,
  client_membership_id UUID,
  description      TEXT NOT NULL,                          -- 'SUMMER25 (25% off)' — frozen at sale
  discount_amount  DECIMAL(10,2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id, tenant_id),
  FOREIGN KEY (cart_item_id, tenant_id)         REFERENCES cart_items(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (promo_code_id, tenant_id)        REFERENCES promo_codes(id, tenant_id),
  FOREIGN KEY (client_membership_id, tenant_id) REFERENCES client_memberships(id, tenant_id)
);


-- ------------------------------------------------------------
-- 8. Promo code redemptions (replaces uses_count counter)
-- ------------------------------------------------------------

CREATE TABLE promo_code_redemptions (
  id             UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  promo_code_id  UUID NOT NULL,
  cart_id        UUID NOT NULL,
  sale_id        UUID,                                     -- NULL until cart completes
  client_id      UUID NOT NULL,
  discount_amount DECIMAL(10,2) NOT NULL,                  -- Total discount applied by this code
  redeemed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id, tenant_id),
  FOREIGN KEY (promo_code_id, tenant_id) REFERENCES promo_codes(id, tenant_id),
  FOREIGN KEY (cart_id, tenant_id)       REFERENCES carts(id, tenant_id),
  FOREIGN KEY (sale_id, tenant_id)       REFERENCES sales(id, tenant_id),
  FOREIGN KEY (client_id, tenant_id)     REFERENCES clients(id, tenant_id),

  -- One redemption per cart per code
  UNIQUE (tenant_id, cart_id, promo_code_id)
);

-- View to keep the old uses_count contract alive for any app code that relied on it
CREATE VIEW promo_code_usage AS
SELECT
  pc.id AS promo_code_id,
  pc.tenant_id,
  pc.code,
  pc.max_uses,
  COUNT(r.id) AS uses_count,
  CASE
    WHEN pc.max_uses IS NULL THEN true
    WHEN COUNT(r.id) < pc.max_uses THEN true
    ELSE false
  END AS has_remaining_uses
FROM promo_codes pc
LEFT JOIN promo_code_redemptions r
  ON r.promo_code_id = pc.id AND r.tenant_id = pc.tenant_id
GROUP BY pc.id, pc.tenant_id, pc.code, pc.max_uses;


-- ------------------------------------------------------------
-- 9. Membership session redemptions (ledger)
-- ------------------------------------------------------------
-- Replaces the unsafe client_memberships.sessions_remaining counter
-- with an append-only ledger. sessions_remaining becomes a view.
-- ------------------------------------------------------------

CREATE TABLE membership_ledger (
  id                   UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_membership_id UUID NOT NULL,
  entry_type           TEXT NOT NULL,                      -- 'grant' (cycle renewal) | 'redemption' | 'adjustment' | 'expiration'
  sessions_delta       INTEGER NOT NULL,                   -- +N for grants, -1 for redemptions, etc.
  cart_item_id         UUID,                               -- If redemption, which service used it
  appointment_id       UUID,
  reason               TEXT,
  created_by_user_id   UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id, tenant_id),
  FOREIGN KEY (client_membership_id, tenant_id) REFERENCES client_memberships(id, tenant_id),
  FOREIGN KEY (cart_item_id, tenant_id)         REFERENCES cart_items(id, tenant_id),
  FOREIGN KEY (appointment_id, tenant_id)       REFERENCES appointments(id, tenant_id)
);

-- View: current sessions remaining per membership
CREATE VIEW client_membership_balance AS
SELECT
  cm.id AS client_membership_id,
  cm.tenant_id,
  cm.client_id,
  COALESCE(SUM(ml.sessions_delta), 0) AS sessions_remaining
FROM client_memberships cm
LEFT JOIN membership_ledger ml
  ON ml.client_membership_id = cm.id AND ml.tenant_id = cm.tenant_id
GROUP BY cm.id, cm.tenant_id, cm.client_id;

-- Drop the old counter column — use the view instead
ALTER TABLE client_memberships DROP COLUMN IF EXISTS sessions_remaining;


-- ------------------------------------------------------------
-- 10. Gift card ledger (same pattern)
-- ------------------------------------------------------------

CREATE TABLE gift_card_ledger (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  gift_card_id    UUID NOT NULL,
  entry_type      TEXT NOT NULL,                           -- 'issue' | 'reload' | 'redemption' | 'refund' | 'expiration'
  amount_delta    DECIMAL(10,2) NOT NULL,                  -- +N for issues/reloads, -N for redemptions
  cart_id         UUID,
  sale_id         UUID,
  payment_id      UUID,                                    -- If purchase/refund tied to a payment
  reason          TEXT,
  created_by_user_id UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (id, tenant_id),
  FOREIGN KEY (gift_card_id, tenant_id) REFERENCES gift_cards(id, tenant_id),
  FOREIGN KEY (cart_id, tenant_id)      REFERENCES carts(id, tenant_id),
  FOREIGN KEY (sale_id, tenant_id)      REFERENCES sales(id, tenant_id),
  FOREIGN KEY (payment_id, tenant_id)   REFERENCES payments(id, tenant_id)
);

CREATE VIEW gift_card_balance AS
SELECT
  gc.id AS gift_card_id,
  gc.tenant_id,
  gc.code,
  gc.initial_amount,
  COALESCE(SUM(gcl.amount_delta), 0) AS balance
FROM gift_cards gc
LEFT JOIN gift_card_ledger gcl
  ON gcl.gift_card_id = gc.id AND gcl.tenant_id = gc.tenant_id
GROUP BY gc.id, gc.tenant_id, gc.code, gc.initial_amount;

-- Drop the old balance counter
ALTER TABLE gift_cards DROP COLUMN IF EXISTS balance;


-- ------------------------------------------------------------
-- 11. Indexes
-- ------------------------------------------------------------

CREATE INDEX idx_carts_tenant_client_status ON carts(tenant_id, client_id, status);
CREATE INDEX idx_carts_tenant_location      ON carts(tenant_id, location_id);
CREATE INDEX idx_carts_appointment          ON carts(appointment_id) WHERE appointment_id IS NOT NULL;

CREATE INDEX idx_cart_items_cart            ON cart_items(tenant_id, cart_id);
CREATE INDEX idx_cart_items_staff           ON cart_items(tenant_id, staff_id) WHERE staff_id IS NOT NULL;

CREATE INDEX idx_payments_tenant_sale       ON payments(tenant_id, sale_id);
CREATE INDEX idx_payments_tenant_cart       ON payments(tenant_id, cart_id);
CREATE INDEX idx_payments_client_created    ON payments(tenant_id, client_id, created_at DESC);
CREATE INDEX idx_payments_external_ref      ON payments(provider, external_payment_ref)
  WHERE external_payment_ref IS NOT NULL;
CREATE INDEX idx_payments_payout            ON payments(tenant_id, payout_id) WHERE payout_id IS NOT NULL;
CREATE INDEX idx_payments_unreconciled      ON payments(tenant_id, created_at)
  WHERE payout_id IS NULL AND status = 'succeeded';

CREATE INDEX idx_sales_tenant_client        ON sales(tenant_id, client_id, created_at DESC);
CREATE INDEX idx_sales_tenant_location      ON sales(tenant_id, location_id, created_at DESC);
CREATE INDEX idx_sales_balance_due          ON sales(tenant_id) WHERE balance_due <> 0;

CREATE INDEX idx_payouts_tenant_status      ON payouts(tenant_id, status, created_at DESC);
CREATE INDEX idx_payouts_arrival            ON payouts(tenant_id, arrival_date DESC);

CREATE UNIQUE INDEX idx_promo_codes_active
  ON promo_codes(tenant_id, code)
  WHERE deleted_at IS NULL AND is_active = true;

CREATE INDEX idx_promo_redemptions_code     ON promo_code_redemptions(tenant_id, promo_code_id);
CREATE INDEX idx_promo_redemptions_client   ON promo_code_redemptions(tenant_id, client_id);

CREATE INDEX idx_membership_ledger_mem      ON membership_ledger(tenant_id, client_membership_id, created_at);
CREATE INDEX idx_gift_card_ledger_card      ON gift_card_ledger(tenant_id, gift_card_id, created_at);

CREATE UNIQUE INDEX idx_gift_cards_code     ON gift_cards(code) WHERE is_active = true;

CREATE INDEX idx_tax_rates_location         ON tax_rates(tenant_id, location_id)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX idx_client_memberships_active
  ON client_memberships(tenant_id, client_id, status)
  WHERE status = 'active';


-- ------------------------------------------------------------
-- 12. Row-level security
-- ------------------------------------------------------------
-- Policy: current tenant is read from session variable 'app.tenant_id'.
-- Set at connection time by the app layer. Superuser / migration user
-- bypasses RLS (Postgres default for table owners). For the app user,
-- RLS is forced.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- Helper macro-style block: enable RLS and add the standard policy
-- (repeated per table because Postgres has no "apply to many" syntax).

ALTER TABLE carts                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_item_taxes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_item_discounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_redemptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships              ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_memberships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_ledger        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_cards               ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_card_ledger         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rates                ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_sequences         ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners that aren't superuser
ALTER TABLE carts                    FORCE ROW LEVEL SECURITY;
ALTER TABLE cart_items               FORCE ROW LEVEL SECURITY;
ALTER TABLE cart_item_taxes          FORCE ROW LEVEL SECURITY;
ALTER TABLE cart_item_discounts      FORCE ROW LEVEL SECURITY;
ALTER TABLE payments                 FORCE ROW LEVEL SECURITY;
ALTER TABLE sales                    FORCE ROW LEVEL SECURITY;
ALTER TABLE payouts                  FORCE ROW LEVEL SECURITY;
ALTER TABLE promo_codes              FORCE ROW LEVEL SECURITY;
ALTER TABLE promo_code_redemptions   FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships              FORCE ROW LEVEL SECURITY;
ALTER TABLE client_memberships       FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_ledger        FORCE ROW LEVEL SECURITY;
ALTER TABLE gift_cards               FORCE ROW LEVEL SECURITY;
ALTER TABLE gift_card_ledger         FORCE ROW LEVEL SECURITY;
ALTER TABLE tax_rates                FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_sequences         FORCE ROW LEVEL SECURITY;

-- Standard tenant isolation policy
CREATE POLICY tenant_isolation ON carts                  USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON cart_items             USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON cart_item_taxes        USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON cart_item_discounts    USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON payments               USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON sales                  USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON payouts                USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON promo_codes            USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON promo_code_redemptions USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON memberships            USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON client_memberships     USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON membership_ledger      USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON gift_cards             USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON gift_card_ledger       USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON tax_rates              USING (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON tenant_sequences       USING (tenant_id = current_tenant_id());

-- Cross-tenant admin role bypass (for platform-level reporting/support)
-- GRANT needs to happen separately; role creation is in migration 000.
-- CREATE POLICY platform_admin_all ON ... TO platform_admin USING (true);


-- ------------------------------------------------------------
-- 13. Trigger: keep sales.amount_paid and balance_due in sync
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION recalc_sale_balance() RETURNS TRIGGER AS $$
DECLARE
  v_sale_id UUID;
  v_tenant_id UUID;
BEGIN
  v_sale_id   := COALESCE(NEW.sale_id, OLD.sale_id);
  v_tenant_id := COALESCE(NEW.tenant_id, OLD.tenant_id);

  IF v_sale_id IS NULL THEN RETURN NEW; END IF;

  UPDATE sales s
  SET amount_paid = COALESCE((
        SELECT SUM(p.amount + p.tip_amount)
        FROM payments p
        WHERE p.sale_id = v_sale_id
          AND p.tenant_id = v_tenant_id
          AND p.status = 'succeeded'
      ), 0),
      balance_due = s.grand_total - COALESCE((
        SELECT SUM(p.amount + p.tip_amount)
        FROM payments p
        WHERE p.sale_id = v_sale_id
          AND p.tenant_id = v_tenant_id
          AND p.status = 'succeeded'
      ), 0),
      updated_at = now()
  WHERE s.id = v_sale_id AND s.tenant_id = v_tenant_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payments_recalc_sale
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION recalc_sale_balance();
