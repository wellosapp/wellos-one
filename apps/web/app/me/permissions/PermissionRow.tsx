'use client';

// One row on the /me/permissions page — icon, copy, status badge, action.
// Three instances on the page: notifications, location, camera. Action
// behavior varies per-type per spec:
//   - notifications: status only — Enable button disabled with
//     "Available when notifications launch" copy (deferred to Epic 8 — Web
//     Push infra).
//   - location: prompt → fires onTrigger which calls
//     navigator.geolocation.getCurrentPosition to grant the permission.
//     The page discards the position; the point is the permission grant
//     so Phase 2 of the geofence epic can later read it.
//   - camera: status only — disabled "Coming soon" copy.
//
// Status of 'denied' shows an "Open settings" button that toggles a small
// inline popover with OS-specific instructions (see _osDetection.ts). We
// can't programmatically open the OS settings app from web; copy is the
// best we can do.

import { useState } from 'react';

import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

import {
  detectOS,
  settingsInstructions,
  type PermissionType,
} from './_osDetection';

export type PermissionStatus =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported'
  | 'unknown';

interface PermissionRowProps {
  type: PermissionType;
  status: PermissionStatus;
  onTrigger: () => void;
}

const COPY: Record<
  PermissionType,
  { title: string; subtitle: string }
> = {
  notifications: {
    title: 'Notifications',
    subtitle: 'Class reminders and updates.',
  },
  location: {
    title: 'Location',
    subtitle: 'Auto check-in when you arrive at the studio.',
  },
  camera: {
    title: 'Camera',
    subtitle: 'Scan QR codes at the front desk (coming soon).',
  },
};

export function PermissionRow({ type, status, onTrigger }: PermissionRowProps) {
  const [helpOpen, setHelpOpen] = useState(false);

  const copy = COPY[type];

  return (
    <li className="rounded-2xl border border-surface-3 bg-white p-s5 shadow-sm">
      <div className="flex items-start gap-s4">
        <span
          aria-hidden
          className="mt-s1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-pale text-accent"
        >
          <PermissionIcon type={type} />
        </span>
        <div className="flex flex-1 flex-col gap-s1">
          <strong className="t-body-lg font-semibold text-ink">
            {copy.title}
          </strong>
          <p className="t-body-sm text-ink-soft">{copy.subtitle}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-s2">
          <StatusBadge status={status} />
          <RowAction
            type={type}
            status={status}
            onTrigger={onTrigger}
            onToggleHelp={() => setHelpOpen((v) => !v)}
            helpOpen={helpOpen}
          />
        </div>
      </div>

      {helpOpen && status === 'denied' ? (
        <SettingsHelp type={type} onClose={() => setHelpOpen(false)} />
      ) : null}
    </li>
  );
}

function StatusBadge({ status }: { status: PermissionStatus }) {
  switch (status) {
    case 'granted':
      return <Badge tone="green">Enabled</Badge>;
    case 'denied':
      return <Badge tone="red">Blocked</Badge>;
    case 'prompt':
      return <Badge tone="neutral">Not yet</Badge>;
    case 'unsupported':
      return <Badge tone="neutral">Not available</Badge>;
    case 'unknown':
    default:
      return <Badge tone="neutral">Checking…</Badge>;
  }
}

function RowAction({
  type,
  status,
  onTrigger,
  onToggleHelp,
  helpOpen,
}: {
  type: PermissionType;
  status: PermissionStatus;
  onTrigger: () => void;
  onToggleHelp: () => void;
  helpOpen: boolean;
}) {
  if (status === 'granted' || status === 'unsupported' || status === 'unknown') {
    // Granted: badge is enough. Unsupported / unknown: nothing actionable.
    return null;
  }

  if (status === 'denied') {
    return (
      <Button
        variant="ghost"
        size="sm"
        type="button"
        onClick={onToggleHelp}
        aria-expanded={helpOpen}
        className="border border-surface-3 bg-white shadow-sm"
      >
        {helpOpen ? 'Hide instructions' : 'Open settings'}
      </Button>
    );
  }

  // status === 'prompt'
  if (type === 'notifications') {
    return (
      <Button
        variant="ghost"
        size="sm"
        type="button"
        disabled
        className="border border-surface-3 bg-white shadow-sm"
      >
        Available when notifications launch
      </Button>
    );
  }

  if (type === 'camera') {
    return (
      <Button
        variant="ghost"
        size="sm"
        type="button"
        disabled
        className="border border-surface-3 bg-white shadow-sm"
      >
        Coming soon
      </Button>
    );
  }

  // type === 'location'
  return (
    <Button variant="accent" size="sm" type="button" onClick={onTrigger}>
      Enable location
    </Button>
  );
}

function SettingsHelp({
  type,
  onClose,
}: {
  type: PermissionType;
  onClose: () => void;
}) {
  // Detection runs on render (client component) — safe because this only
  // shows after a user click and the parent is 'use client'. We don't
  // memoize because the OS doesn't change inside a session.
  const { title, steps } = settingsInstructions(detectOS(), type);

  return (
    <div
      className={cn(
        'mt-s4 rounded-xl border border-surface-3 bg-surface-2 px-s4 py-s3',
        't-body-sm text-ink',
      )}
      role="region"
      aria-label="Permission settings instructions"
    >
      <div className="flex items-start justify-between gap-s3">
        <strong className="t-body-sm font-semibold text-ink">{title}</strong>
        <button
          type="button"
          onClick={onClose}
          aria-label="Hide instructions"
          className="t-body-sm text-ink-soft hover:text-ink focus-visible:shadow-focus focus-visible:outline-none rounded-sm"
        >
          ×
        </button>
      </div>
      <ol className="mt-s2 ml-s4 list-decimal text-ink-soft">
        {steps.map((step) => (
          <li key={step} className="mt-s1">
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

// Inline icons — stroke 1.6, 24x24 viewBox, currentColor. Matches admin
// icons.tsx vocabulary. Bell already exists in icons.tsx but we inline
// here so PermissionRow doesn't reach into /admin (per spec — clean
// dependency direction).

function PermissionIcon({ type }: { type: PermissionType }) {
  switch (type) {
    case 'notifications':
      return <BellIcon />;
    case 'location':
      return <MapPinIcon />;
    case 'camera':
      return <CameraIcon />;
  }
}

function BellIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M18 16V11a6 6 0 1 0-12 0v5l-2 3h16z" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
