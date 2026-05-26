import { Badge, Button, Card } from '@/components/ui';

import { SIGN_UP_URL } from './links';

export function EarlyAccess() {
  return (
    <section id="pricing" className="py-s12 md:py-[96px]">
      <div className="mx-auto max-w-4xl px-s6">
        <Card
          variant="accent"
          padding="lg"
          className="flex flex-col items-start gap-s5 md:flex-row md:items-center md:justify-between"
        >
          <div className="flex flex-col gap-s3 md:max-w-[520px]">
            <Badge tone="accent" className="self-start">
              Early access
            </Badge>
            <h2 className="t-display-lg text-ink md:text-[28px]">
              Lock in early-access pricing.
            </h2>
            <p className="t-body-md text-ink-soft">
              We’re onboarding founding operators now. No credit card, no
              contract — just the lowest price Wellos will ever cost.
            </p>
          </div>
          <a href={SIGN_UP_URL}>
            <Button variant="accent" size="lg">
              Claim early access
            </Button>
          </a>
        </Card>
      </div>
    </section>
  );
}
