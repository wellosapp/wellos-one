import type { Route } from 'next';
import Link from 'next/link';

import { Card } from '@/components/ui';
import { getTenantBookingSettings } from '@/lib/api/booking-settings';
import { cn } from '@/lib/cn';

import { BookingSettingsForm } from './BookingSettingsForm';
import {
  type BookingSettingsFormValues,
  updateBookingSettingsAction,
} from './_actions';

// /admin/settings — tenant-level booking defaults (R2 §12).
// Per-staff overrides live on each Staff detail page.

function settingsToFormDefaults(
  s: Awaited<ReturnType<typeof getTenantBookingSettings>>['settings'],
): BookingSettingsFormValues {
  return {
    bookingDepositsEnabled: s.bookingDepositsEnabled,
    bookingDepositAmountDollars: (s.bookingDepositAmountCents / 100).toFixed(2),
    bookingCancellationWindowHours: String(s.bookingCancellationWindowHours),
    bookingCancellationFeeDollars: (s.bookingCancellationFeeCents / 100).toFixed(2),
    bookingNoShowFeeDollars: (s.bookingNoShowFeeCents / 100).toFixed(2),
    bookingMinNoticeHours: String(s.bookingMinNoticeHours),
    bookingMaxWindowDays: String(s.bookingMaxWindowDays),
    bookingDefaultBufferMinutes: String(s.bookingDefaultBufferMinutes),
    bookingWalkInsAllowed: s.bookingWalkInsAllowed,
    bookingTipsEnabled: s.bookingTipsEnabled,
    bookingClientRecognitionMode: s.bookingClientRecognitionMode,
    bookingOverrideRoles: s.bookingOverrideRoles,
  };
}

export default async function AdminSettingsPage() {
  const { settings } = await getTenantBookingSettings();

  return (
    <div className="flex flex-col gap-s6">
      <Link
        href={'/admin/settings/branding' as Route}
        className={cn(
          'block rounded-md border border-line bg-surface p-s5 shadow-sm',
          'transition-colors duration-fast hover:bg-sage-tint-2 no-underline',
        )}
      >
        <div className="t-eyebrow tracking-wide text-sage">BRAND PALETTE</div>
        <h2 className="mt-s2 font-display text-[18px] text-ink">
          Customize your brand colors →
        </h2>
        <p className="mt-s1 t-body-sm text-ink-3">
          Edit the color palette used in service color pickers and (future) the
          public booking page.
        </p>
      </Link>

      <Link
        href={'/admin/settings/geofence' as Route}
        className={cn(
          'block rounded-md border border-line bg-surface p-s5 shadow-sm',
          'transition-colors duration-fast hover:bg-sage-tint-2 no-underline',
        )}
      >
        <div className="t-eyebrow tracking-wide text-sage">STUDIO LOCATIONS</div>
        <h2 className="mt-s2 font-display text-[18px] text-ink">
          Configure geofence auto check-in →
        </h2>
        <p className="mt-s1 t-body-sm text-ink-3">
          Set the GPS boundaries where clients can auto check-in for their
          classes.
        </p>
      </Link>

      <header className="flex flex-col gap-s1">
        <span className="t-eyebrow text-accent">Settings</span>
        <h1 className="t-display-lg">Booking settings</h1>
        <p className="t-body-md text-ink-soft">
          Tenant-wide defaults. Each staff member can override a few of these on
          their own profile.
        </p>
      </header>

      <Card padding="lg">
        <BookingSettingsForm
          action={updateBookingSettingsAction}
          initial={settingsToFormDefaults(settings)}
        />
      </Card>
    </div>
  );
}
