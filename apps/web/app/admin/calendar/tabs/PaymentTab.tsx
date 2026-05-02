'use client';

import { Card } from '@/components/ui';

// Empty state — payments enable in Epic 6. Wired up once Stripe Connect lands
// (see CLAUDE.md §3 Payments + memory:stripe_deferred).
export function PaymentTab() {
  return (
    <Card padding="lg" className="border border-dashed border-surface-3 bg-surface-2/40">
      <div className="flex flex-col gap-s2">
        <span className="t-eyebrow text-accent">Coming with Epic 6</span>
        <h3 className="t-display-sm text-ink">Payments not yet enabled</h3>
        <p className="t-body-md text-ink-soft">
          Deposit, balance, and receipts will appear here once Stripe Connect
          is wired up. No payment fields exist on Appointment yet — by design.
        </p>
      </div>
    </Card>
  );
}
