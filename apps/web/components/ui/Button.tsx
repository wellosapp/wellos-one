import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

type ButtonVariant = 'primary' | 'accent' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-soft',
  accent: 'bg-accent text-white hover:bg-accent-mid',
  ghost: 'bg-transparent text-ink hover:bg-surface-2',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-[14px] py-[7px] text-[13px] rounded-sm',
  md: 'px-s5 py-[10px] text-[14px] rounded-md',
  lg: 'px-s8 py-[14px] text-[15px] rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'accent',
    size = 'md',
    loading = false,
    icon,
    disabled,
    className,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-s2 font-sans font-medium',
        'transition-[background-color,transform,box-shadow] duration-fast',
        'focus-visible:outline-none focus-visible:shadow-focus',
        !isDisabled && 'hover:-translate-y-px hover:shadow-md cursor-pointer',
        isDisabled && 'opacity-40 cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <Spinner />
      ) : (
        <>
          {icon ? <span className="inline-flex shrink-0">{icon}</span> : null}
          <span>{children}</span>
        </>
      )}
    </button>
  );
});

function Spinner() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="animate-spin"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
