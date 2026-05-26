import { cn } from '@/lib/cn';

interface WordmarkProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses: Record<NonNullable<WordmarkProps['size']>, string> = {
  sm: 't-display-sm',
  md: 't-display-md',
  lg: 't-display-lg',
};

/**
 * Wellos wordmark. Uses the display font (Sora) with a sage accent on the
 * trailing dot to give the mark a quiet, deliberate feel.
 */
export function Wordmark({ className, size = 'md' }: WordmarkProps) {
  return (
    <span
      className={cn('inline-flex items-baseline gap-[2px]', sizeClasses[size], className)}
      aria-label="Wellos"
    >
      <span className="text-ink">wellos</span>
      <span className="text-accent" aria-hidden="true">
        .
      </span>
    </span>
  );
}
