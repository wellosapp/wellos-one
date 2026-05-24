import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import type { StaffWithServices } from '@/lib/api/staff';

// Restyled hero block for the staff profile. Mirrors `ClientProfileHero`
// (initials avatar, soft sage radial, eyebrow + display headline, contact
// strip, badge row, right-side action slot). Pure presentation — no client
// state, so it stays a server component.

function staffInitials(staff: StaffWithServices): string {
  const a = staff.firstName.trim()[0] ?? '';
  const b = staff.lastName?.trim()[0] ?? '';
  return (a + b).toUpperCase() || '?';
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 7h16v10H4V7zm0 0l8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M8 3l2 4-2 2c1 4 4 7 8 8l2-2 4 2v4c0 1-1 2-2 2C9 17 3 11 3 5c0-1 1-2 2-2h3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M7 3v3M17 3v3M4 10h16M6 7h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V9a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StaffProfileHero({ staff }: { staff: StaffWithServices }) {
  const displayName =
    [staff.firstName, staff.lastName].filter(Boolean).join(' ').trim() ||
    'Staff';
  const initials = staffInitials(staff);
  const joined = new Date(staff.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-lg border border-line bg-surface p-s6 shadow-md',
        'lg:p-s8',
      )}
    >
      {/* Soft sage radial in the top-right — mirrors the design's .profile-hero::before */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute right-0 top-0 h-full w-[220px]',
          'bg-[radial-gradient(ellipse_at_top_right,var(--sage-tint)_0%,transparent_65%)] opacity-70',
        )}
      />

      <div
        className={cn(
          'relative flex flex-col gap-s5',
          'sm:grid sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center sm:gap-s6',
        )}
      >
        <div
          aria-hidden
          className={cn(
            'flex h-24 w-24 shrink-0 items-center justify-center rounded-md',
            'border border-sage-soft bg-gradient-to-br from-sage-tint to-sage-soft',
            'font-display text-[38px] leading-none text-sage-deep',
          )}
        >
          {initials}
        </div>

        <div className="min-w-0">
          <div className="t-eyebrow text-sage">Staff member</div>
          <h1
            className={cn(
              'mt-s2 font-display leading-[1.05] tracking-tight text-ink',
              'text-[34px] sm:text-[38px]',
            )}
          >
            {staff.firstName}{' '}
            {staff.lastName ? (
              <em className="font-normal italic text-sage-deep">
                {staff.lastName}
              </em>
            ) : null}
            {!staff.firstName && !staff.lastName ? displayName : null}
          </h1>

          {staff.jobTitle && (
            <p className="mt-s2 t-body-md text-ink-soft">{staff.jobTitle}</p>
          )}

          <div className="mt-s4 flex flex-wrap items-center gap-x-s6 gap-y-s2 t-body-sm text-ink-2">
            {staff.email && (
              <span className="inline-flex items-center gap-s2">
                <MailIcon className="h-[14px] w-[14px] shrink-0 text-ink-4" />
                <span className="truncate">{staff.email}</span>
              </span>
            )}
            {staff.phone && (
              <span className="inline-flex items-center gap-s2">
                <PhoneIcon className="h-[14px] w-[14px] shrink-0 text-ink-4" />
                <span>{staff.phone}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-s2 text-ink-3">
              <CalendarIcon className="h-[14px] w-[14px] shrink-0 text-ink-4" />
              Joined {joined}
            </span>
          </div>

          <div className="mt-s4 flex flex-wrap items-center gap-s2">
            {staff.deletedAt ? (
              <Badge tone="red">
                Inactive · {new Date(staff.deletedAt).toLocaleDateString()}
              </Badge>
            ) : staff.active ? (
              <Badge tone="green">Active</Badge>
            ) : (
              <Badge tone="neutral">Inactive</Badge>
            )}
          </div>
        </div>

        <div className="sm:self-start">
          <Button
            type="button"
            variant="ghost"
            size="md"
            disabled
            title="Coming soon — staff invite flow lands in Phase 3."
            className="opacity-60"
          >
            Send invite
          </Button>
        </div>
      </div>
    </section>
  );
}
