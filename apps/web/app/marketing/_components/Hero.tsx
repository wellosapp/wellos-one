import { Badge, Button } from '@/components/ui';

import { SIGN_UP_URL } from './links';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft sage glow anchored top-right — no image, just a layered radial */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-accent-pale/70 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-1/2 h-[360px] w-[360px] rounded-full bg-surface-2/80 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-6xl gap-s10 px-s6 py-s12 md:grid-cols-[1.15fr_1fr] md:items-center md:gap-s12 md:py-[96px] lg:py-[120px]">
        <div className="flex flex-col gap-s6">
          <Badge tone="accent" className="self-start">
            Early access
          </Badge>

          <h1 className="t-display-xl text-ink md:text-[44px] lg:text-[56px] lg:leading-[1.05]">
            Wellness booking that finally feels like your business.
          </h1>

          <p className="t-body-lg max-w-[44ch] text-ink-soft">
            Calendar, booking, payments, SMS, and intake forms — built for salons,
            massage, medspa, fitness, and personal training. Multi-vertical from
            day one. No iframe duct tape.
          </p>

          <div className="flex flex-wrap items-center gap-s3 pt-s2">
            <a href={SIGN_UP_URL}>
              <Button variant="accent" size="lg">
                Get started
              </Button>
            </a>
            <a href="#how">
              <Button variant="ghost" size="lg">
                See how it works
              </Button>
            </a>
          </div>

          <p className="t-body-sm text-ink-soft/80">
            No credit card. No contract. Built for boutique businesses.
          </p>
        </div>

        <HeroArtwork />
      </div>
    </section>
  );
}

function HeroArtwork() {
  return (
    <div className="relative hidden md:block">
      {/* Stacked translucent cards suggesting a calendar / booking surface
          without committing to a literal screenshot. */}
      <div className="relative h-[420px] w-full">
        <div className="absolute right-0 top-s8 h-[300px] w-[88%] rounded-xl bg-white shadow-lg">
          <div className="flex h-full flex-col gap-s4 p-s6">
            <div className="flex items-center justify-between">
              <span className="t-eyebrow text-ink-soft">Today · Tuesday</span>
              <span className="inline-flex h-s4 w-s4 rounded-full bg-accent" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-s3">
              {[
                { time: '9:00', name: 'Maya R.', service: 'Deep tissue · 60m', tone: 'bg-accent-pale text-accent' },
                { time: '10:30', name: 'Jordan T.', service: 'Color refresh · 90m', tone: 'bg-amber-pale text-amber' },
                { time: '12:00', name: 'Lunch', service: 'Blocked', tone: 'bg-surface-2 text-ink-soft' },
                { time: '1:30', name: 'Devon S.', service: 'Lash fill · 45m', tone: 'bg-green-pale text-green' },
              ].map((row) => (
                <div
                  key={row.time}
                  className="flex items-center gap-s4 rounded-md border border-surface-3/60 px-s4 py-s3"
                >
                  <span className="t-caption w-[42px] text-ink-soft">{row.time}</span>
                  <div className="flex flex-1 flex-col">
                    <span className="t-body-sm text-ink">{row.name}</span>
                    <span className="t-caption text-ink-soft">{row.service}</span>
                  </div>
                  <span className={`t-caption rounded-sm px-s2 py-[2px] ${row.tone}`}>Booked</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute left-0 top-0 h-[180px] w-[64%] rounded-xl bg-ink p-s5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <span className="t-eyebrow text-white/60">Today</span>
            <span className="t-caption text-white/60">$1,840</span>
          </div>
          <p className="mt-s3 t-display-lg text-white">12 appointments</p>
          <p className="mt-s2 t-body-sm text-white/70">Two on the waitlist · One needs intake</p>
        </div>

        <div className="absolute bottom-0 left-s8 h-[120px] w-[58%] rounded-xl bg-accent-pale p-s5 shadow-md">
          <span className="t-eyebrow text-accent">SMS</span>
          <p className="mt-s2 t-body-sm text-ink">
            “See you tomorrow at 9 — reply Y to confirm or R to reschedule.”
          </p>
        </div>
      </div>
    </div>
  );
}
