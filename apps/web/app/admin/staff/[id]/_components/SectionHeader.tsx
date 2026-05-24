import type { ComponentType, ReactNode } from 'react';

import { cn } from '@/lib/cn';

// Card chrome + header row for an Overview section. The header itself is the
// eyebrow (with leading icon) + display-font headline + optional subtitle.
// The consumer passes section body content as children. Renders the whole
// card so the call-site doesn't have to re-state the chrome on every section.

type IconComponent = ComponentType<{ size?: number; className?: string }>;

export function SectionHeader({
  icon: IconCmp,
  eyebrow,
  headline,
  subtitle,
  tone = 'default',
  children,
}: {
  icon: IconComponent;
  eyebrow: string;
  headline: string;
  subtitle?: string;
  tone?: 'default' | 'danger';
  children?: ReactNode;
}) {
  const eyebrowClass =
    tone === 'danger' ? 'text-terracotta' : 'text-sage';

  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
      )}
    >
      <header
        className={cn(
          'border-b border-line bg-surface-sunk/40',
          'px-s6 py-s5 lg:px-s8 lg:py-s6',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-s2 t-eyebrow tracking-wide',
            eyebrowClass,
          )}
        >
          <IconCmp size={14} />
          <span>{eyebrow}</span>
        </div>
        <h2 className="mt-s2 font-display text-[22px] leading-tight text-ink">
          {headline}
        </h2>
        {subtitle && (
          <p className="mt-s2 max-w-2xl t-body-md leading-relaxed text-ink-3">
            {subtitle}
          </p>
        )}
      </header>
      {children && (
        <div className="px-s6 py-s5 lg:px-s8 lg:py-s6">{children}</div>
      )}
    </section>
  );
}
