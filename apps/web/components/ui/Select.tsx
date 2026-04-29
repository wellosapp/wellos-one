import { forwardRef, type SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

// Native <select> styled to match Input. Chevron via inline SVG so the
// closed-state visual is consistent across browsers; the open dropdown panel
// is still browser-native (Radix-based replacement is a Phase 2 upgrade for
// public-facing surfaces — see docs/10-design-system-buildout.md §4.3).
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { error, className, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          'w-full bg-white text-ink font-sans text-[16px] appearance-none',
          'border-[1.5px] rounded-md',
          'px-s4 py-[13px] pr-[44px]',
          'transition-[border-color,box-shadow] duration-fast',
          'focus:outline-none focus:shadow-focus',
          error
            ? 'border-red focus:border-red'
            : 'border-surface-3 focus:border-accent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-s4 top-1/2 -translate-y-1/2 text-ink-soft"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
      >
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
});
