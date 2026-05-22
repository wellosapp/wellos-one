import type { ComponentType } from 'react';

import { cn } from '@/lib/cn';

// Shared section-header block. Eyebrow + display-font headline + subtitle.
// Used at the top of every section card on every client profile subroute.
// Verbatim copy lives in the calling page so each section reads
// independently in code review.
//
// `tone="danger"` swaps the sage eyebrow for terracotta — used by the
// soft-delete card on the Overview page.

type SectionHeaderTone = 'default' | 'danger';

type IconComponent = ComponentType<{ size?: number; className?: string }>;

export function SectionHeader({
  icon: Icon,
  eyebrow,
  headline,
  subtitle,
  tone = 'default',
}: {
  icon: IconComponent;
  eyebrow: string;
  headline: string;
  subtitle: string;
  tone?: SectionHeaderTone;
}) {
  return (
    <div className="flex flex-col gap-s2">
      <div
        className={cn(
          't-eyebrow inline-flex items-center gap-s2 tracking-wide',
          tone === 'danger' ? 'text-red' : 'text-sage',
        )}
      >
        <Icon className="h-[13px] w-[13px] shrink-0" />
        <span>{eyebrow}</span>
      </div>
      <h2
        className={cn(
          'font-display text-[28px] leading-tight tracking-tight text-ink',
        )}
      >
        {headline}
      </h2>
      <p className="max-w-2xl t-body-md leading-relaxed text-ink-3">
        {subtitle}
      </p>
    </div>
  );
}
