import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

type AlertTone = 'info' | 'success' | 'warning' | 'error';

interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: AlertTone;
  title?: ReactNode;
}

const toneClasses: Record<AlertTone, string> = {
  info: 'bg-surface-2 text-ink border-surface-3',
  success: 'bg-green-pale text-green border-green/30',
  warning: 'bg-amber-pale text-amber border-amber/30',
  error: 'bg-red-pale text-red border-red/30',
};

const roleByTone: Record<AlertTone, 'status' | 'alert'> = {
  info: 'status',
  success: 'status',
  warning: 'alert',
  error: 'alert',
};

export function Alert({
  tone = 'info',
  title,
  className,
  children,
  role,
  ...props
}: AlertProps) {
  return (
    <div
      role={role ?? roleByTone[tone]}
      className={cn(
        'rounded-md border px-s4 py-s3 t-body-md font-sans',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {title ? <div className="t-display-sm mb-s1">{title}</div> : null}
      {children}
    </div>
  );
}
