import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, icon, className, ...props },
  ref,
) {
  const base = (
    <input
      ref={ref}
      className={cn(
        'w-full bg-white text-ink font-sans text-[16px]',
        'border-[1.5px] rounded-md',
        'px-s4 py-[13px]',
        'transition-[border-color,box-shadow] duration-fast',
        'placeholder:text-placeholder',
        'focus:outline-none focus:shadow-focus',
        error
          ? 'border-red focus:border-red'
          : 'border-surface-3 focus:border-accent',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        icon && 'pl-[48px]',
        className,
      )}
      {...props}
    />
  );

  if (!icon) return base;

  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-s4 top-1/2 -translate-y-1/2 text-ink-soft"
      >
        {icon}
      </span>
      {base}
    </div>
  );
});
