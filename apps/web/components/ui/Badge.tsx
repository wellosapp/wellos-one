import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type BadgeTone = 'neutral' | 'accent' | 'red' | 'amber' | 'green';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-ink-soft',
  accent: 'bg-accent-pale text-accent',
  red: 'bg-red-pale text-red',
  amber: 'bg-amber-pale text-amber',
  green: 'bg-green-pale text-green',
};

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-s1 rounded-sm px-s2 py-[2px]',
        't-caption font-sans',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
