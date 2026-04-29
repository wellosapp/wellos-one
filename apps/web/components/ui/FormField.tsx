import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface FormFieldProps {
  label: ReactNode;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  required,
  error,
  hint,
  className,
  children,
}: FormFieldProps) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn('flex flex-col gap-s2 t-body-sm text-ink-soft', className)}
    >
      <span className="font-sans">
        {label}
        {required ? <span className="text-red"> *</span> : null}
      </span>
      {children}
      {error ? <span className="t-caption text-red font-sans">{error}</span> : null}
      {hint && !error ? (
        <span className="t-caption text-ink-soft/70 font-sans">{hint}</span>
      ) : null}
    </label>
  );
}
