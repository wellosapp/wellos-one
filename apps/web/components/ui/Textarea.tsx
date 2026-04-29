import { forwardRef, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { error, className, rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'w-full bg-white text-ink font-sans text-[16px]',
        'border-[1.5px] rounded-md',
        'px-s4 py-[13px]',
        'min-h-[96px] resize-y',
        'transition-[border-color,box-shadow] duration-fast',
        'placeholder:text-placeholder',
        'focus:outline-none focus:shadow-focus',
        error
          ? 'border-red focus:border-red'
          : 'border-surface-3 focus:border-accent',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  );
});
