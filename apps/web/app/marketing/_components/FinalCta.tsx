import { Button } from '@/components/ui';

import { SIGN_UP_URL } from './links';

export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-ink py-s12 md:py-[120px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-32 h-[420px] w-[420px] rounded-full bg-accent/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-20 h-[420px] w-[420px] rounded-full bg-accent/15 blur-3xl"
      />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-s6 px-s6 text-center">
        <h2 className="t-display-xl text-white md:text-[40px] lg:text-[48px] lg:leading-[1.1]">
          Replace four broken tools with one that respects your work.
        </h2>
        <p className="t-body-lg max-w-[44ch] text-white/70">
          Calendar, booking, payments, and messaging — together, finally.
          Built for the way boutique businesses actually run.
        </p>
        <a href={SIGN_UP_URL}>
          <Button variant="accent" size="lg">
            Get started
          </Button>
        </a>
      </div>
    </section>
  );
}
