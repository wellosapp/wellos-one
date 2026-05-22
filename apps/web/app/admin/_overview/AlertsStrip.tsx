// AlertsStrip — row of dismissable-feeling tiles flagging items needing
// attention (e.g. pending approvals, unread messages, missing intake).
//
// Two render modes per tile, driven by AlertItem.kind:
//   - 'computed'    → live data with an action button on the right.
//   - 'coming-soon' → dimmed tile, italic 'Coming soon' caption, no action.

import type { Route } from 'next';
import Link from 'next/link';
import {
  WarnIcon,
  BellIcon,
  ClipboardIcon,
} from '@/app/admin/_shell/icons';
import type { AlertItem } from './types';

type AlertsStripProps = {
  alerts: AlertItem[];
};

function alertIcon(kind: AlertItem['icon']) {
  switch (kind) {
    case 'warn':
      return <WarnIcon size={16} />;
    case 'bell':
      return <BellIcon size={16} />;
    case 'clipboard':
      return <ClipboardIcon size={16} />;
  }
}

export function AlertsStrip({ alerts }: AlertsStripProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-s3 md:grid-cols-2">
      {alerts.map((alert) => {
        const isComingSoon = alert.kind === 'coming-soon';
        // Split text on first sentence-ish boundary so the leading clause
        // can render bold (matches the design's `<b>` emphasis).
        const [head, ...rest] = alert.text.split(' — ');
        const tail = rest.length > 0 ? ` — ${rest.join(' — ')}` : '';

        return (
          <div
            key={alert.id}
            className={`flex items-center gap-s3 rounded-md border border-sand-soft border-l-[3px] border-l-sand bg-sand-soft px-s3 py-s2 t-body-md text-ink-2 ${
              isComingSoon ? 'opacity-60' : ''
            }`}
          >
            <span className="text-sand">{alertIcon(alert.icon)}</span>
            <span className="flex-1">
              <strong className="font-semibold text-ink">{head}</strong>
              {tail}
              {isComingSoon ? (
                <span className="ml-s2 font-display italic t-caption text-ink-4">
                  Coming soon
                </span>
              ) : null}
            </span>
            {!isComingSoon && alert.action ? (
              <Link
                href={alert.action.href as Route}
                className="inline-flex items-center rounded-sm px-s2 py-[4px] text-[12px] font-semibold text-ink hover:bg-black/5"
              >
                {alert.action.label}
              </Link>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
