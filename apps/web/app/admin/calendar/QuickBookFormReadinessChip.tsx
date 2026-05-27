'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  getServiceFormReadinessAction,
  type FormReadinessActionResult,
} from './form-readiness-actions';
import type { FormReadinessRule } from '@/lib/api/form-readiness';

// PR 8 — Reusable status chip for the Quick Book panel + admin
// client-book. Surfaces hard_required, soft_required, and optional form
// state for the (service, client) pair so the operator knows what's
// outstanding before they click Book.
//
// This is a READ surface only. "Send Form" actions navigate to
// /admin/clients/:id/intake — inline send-from-quick-book is deferred.

type Tone = 'sage' | 'amber' | 'red' | 'neutral';

function toneClasses(tone: Tone): string {
  switch (tone) {
    case 'sage':
      return 'border-green/30 bg-green-pale/60 text-green';
    case 'amber':
      return 'border-amber/30 bg-amber-pale/60 text-amber-900';
    case 'red':
      return 'border-red/30 bg-red-50 text-red-900';
    case 'neutral':
      return 'border-surface-3 bg-surface text-ink-soft';
  }
}

function reasonLabel(rule: FormReadinessRule): string {
  if (rule.satisfied) return 'Complete';
  switch (rule.unsatisfiedReason) {
    case 'expired_per_rule':
      return 'Expired';
    case 'never_submitted':
    default:
      if (rule.latestSubmissionStatus && rule.latestSubmissionStatus !== 'submitted') {
        switch (rule.latestSubmissionStatus) {
          case 'sent':
            return 'Sent, not complete';
          case 'opened':
            return 'Opened, not complete';
          case 'in_progress':
            return 'Started, not complete';
          case 'draft':
          case 'assigned':
            return 'Drafted, not sent';
          case 'cancelled':
            return 'Cancelled';
          default:
            return 'Not complete';
        }
      }
      return 'Not sent';
  }
}

interface QuickBookFormReadinessChipProps {
  serviceId: string;
  clientId: string;
  /** Where the "Send Form" link should navigate. */
  intakeHref: string;
  /** Notify parent when blocksBooking state changes — used to gate the Book
   *  button's confirmation dialog. Called with `true` when hard_required forms
   *  are unsatisfied. */
  onBlocksBookingChange?: (blocks: boolean) => void;
}

export function QuickBookFormReadinessChip({
  serviceId,
  clientId,
  intakeHref,
  onBlocksBookingChange,
}: QuickBookFormReadinessChipProps) {
  const [state, setState] = useState<FormReadinessActionResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!serviceId || !clientId) {
      setState(null);
      onBlocksBookingChange?.(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // Debounce a touch so rapid service/client toggles don't fan-out a
    // burst of identical fetches.
    const handle = setTimeout(() => {
      void getServiceFormReadinessAction({ serviceId, clientId }).then((res) => {
        if (cancelled) return;
        setLoading(false);
        setState(res);
        if (res.ok) {
          onBlocksBookingChange?.(res.readiness.blocksBooking);
        } else {
          // On read failure, don't claim the booking is blocked — admin can
          // still book through. Public flow has its own server-side gate.
          onBlocksBookingChange?.(false);
        }
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [serviceId, clientId, onBlocksBookingChange]);

  if (!serviceId || !clientId) return null;
  if (loading && !state) {
    return (
      <span className="t-caption italic text-ink-soft">Checking forms…</span>
    );
  }
  if (!state) return null;
  if (!state.ok) {
    // Don't block the booking surface on a readiness lookup failure; just
    // show a soft warning. The booking-create itself enforces the public-flow
    // gate; admin can still book through.
    return (
      <div
        className={cn(
          'rounded-xl border px-s3 py-s2 t-caption',
          toneClasses('neutral'),
        )}
        role="status"
      >
        Could not load form readiness: {state.error}
      </div>
    );
  }

  const { rules, hardRequiredUnsatisfied, softRequiredUnsatisfied } = state.readiness;

  if (rules.length === 0) {
    return (
      <div
        className={cn(
          'rounded-xl border px-s3 py-s2 t-caption font-medium',
          toneClasses('sage'),
        )}
        role="status"
        aria-label="All forms complete"
      >
        All forms complete
      </div>
    );
  }

  const someUnsatisfied =
    hardRequiredUnsatisfied.length + softRequiredUnsatisfied.length > 0;

  if (!someUnsatisfied) {
    return (
      <div
        className={cn(
          'rounded-xl border px-s3 py-s2 t-caption font-medium',
          toneClasses('sage'),
        )}
        role="status"
      >
        All forms complete · {rules.length}{' '}
        {rules.length === 1 ? 'form attached' : 'forms attached'}
      </div>
    );
  }

  const tone: Tone =
    hardRequiredUnsatisfied.length > 0 ? 'red' : 'amber';

  const heading =
    hardRequiredUnsatisfied.length > 0
      ? `${hardRequiredUnsatisfied.length} hard-required form${
          hardRequiredUnsatisfied.length === 1 ? '' : 's'
        } not complete`
      : `${softRequiredUnsatisfied.length} form${
          softRequiredUnsatisfied.length === 1 ? '' : 's'
        } requested but not complete`;

  const listed = [
    ...hardRequiredUnsatisfied,
    ...softRequiredUnsatisfied,
  ];

  return (
    <div
      className={cn(
        'flex flex-col gap-s2 rounded-xl border px-s3 py-s2',
        toneClasses(tone),
      )}
      role={hardRequiredUnsatisfied.length > 0 ? 'alert' : 'status'}
    >
      <strong className="t-body-sm font-semibold">{heading}</strong>
      <ul className="flex flex-col gap-s1">
        {listed.map((r) => (
          <li
            key={r.ruleId}
            className="flex items-center justify-between gap-s2 t-caption"
          >
            <span className="truncate">
              <span className="font-medium">{r.formTitle}</span>{' '}
              <span className="text-ink-soft">· {reasonLabel(r)}</span>
            </span>
            <Badge
              tone={r.requiredLevel === 'hard_required' ? 'red' : 'amber'}
            >
              {r.requiredLevel === 'hard_required' ? 'Required' : 'Requested'}
            </Badge>
          </li>
        ))}
      </ul>
      <Link
        href={intakeHref as Route}
        className="t-caption font-semibold underline-offset-2 hover:underline"
      >
        Open client intake →
      </Link>
    </div>
  );
}
