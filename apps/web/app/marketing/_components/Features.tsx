import type { ReactNode } from 'react';

import { Card } from '@/components/ui';

import {
  BookingIcon,
  CalendarIcon,
  ClientIcon,
  FormIcon,
  MessageIcon,
  PaymentIcon,
} from './icons';

interface Feature {
  icon: ReactNode;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: <CalendarIcon className="text-accent" />,
    title: 'Smart calendar',
    body:
      'Day, week, and month views. Drag to reschedule. A density wave shows the heat of your day. Block lunch in two clicks.',
  },
  {
    icon: <BookingIcon className="text-accent" />,
    title: 'Public booking',
    body:
      'Login-free booking with slot holds so two clients can never grab the same time. Approval-required and staff-only services supported.',
  },
  {
    icon: <ClientIcon className="text-accent" />,
    title: 'Client memory',
    body:
      'Categorized notes — preferences, allergies, clinical, behavioral — with alert-priority surfacing and an append-only audit trail.',
  },
  {
    icon: <MessageIcon className="text-accent" />,
    title: 'SMS + email',
    body:
      'Day-before schedule reminders, arrival nudges, post-appointment thank-yous. One platform for every touchpoint.',
  },
  {
    icon: <PaymentIcon className="text-accent" />,
    title: 'Payments that don’t break',
    body:
      'Tip-as-a-single-state, deposits, no-show fees, and in-person Stripe Terminal. Reconciles cleanly, every time.',
  },
  {
    icon: <FormIcon className="text-accent" />,
    title: 'Intake forms',
    body:
      'First-party form builder — no iframes. Signature capture, e-sign audit log, mobile-first, attached to services automatically.',
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-s12 md:py-[96px]">
      <div className="mx-auto max-w-6xl px-s6">
        <div className="mb-s10 flex flex-col gap-s3 md:max-w-[640px]">
          <span className="t-eyebrow text-accent">Everything in one place</span>
          <h2 className="t-display-xl text-ink md:text-[36px]">
            One system that runs the work — not four that fight each other.
          </h2>
          <p className="t-body-lg text-ink-soft">
            Wellos is the bookings, payments, messaging, and intake stack used
            by independent operators who care how their software feels.
          </p>
        </div>

        <div className="grid gap-s4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card
              key={feature.title}
              variant="default"
              padding="md"
              className="flex flex-col gap-s4 transition-shadow duration-base hover:shadow-md"
            >
              <span className="inline-flex h-s10 w-s10 items-center justify-center rounded-md bg-accent-pale">
                {feature.icon}
              </span>
              <div className="flex flex-col gap-s2">
                <h3 className="t-display-sm text-ink">{feature.title}</h3>
                <p className="t-body-md text-ink-soft">{feature.body}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
