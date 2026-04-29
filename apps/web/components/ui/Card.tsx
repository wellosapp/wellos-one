import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type CardVariant = 'default' | 'accent' | 'dark';
type CardPadding = 'sm' | 'md' | 'lg';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
  as?: 'div' | 'section' | 'article';
}

const variantClasses: Record<CardVariant, string> = {
  default: 'bg-white text-ink shadow-sm',
  accent: 'bg-accent-pale text-ink shadow-sm',
  dark: 'bg-ink text-white shadow-md',
};

const paddingClasses: Record<CardPadding, string> = {
  sm: 'p-s4',
  md: 'p-s6',
  lg: 'p-s8',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'default', padding = 'md', as = 'div', className, ...props },
  ref,
) {
  const Tag = as;
  return (
    <Tag
      ref={ref as never}
      className={cn(
        'rounded-lg',
        variantClasses[variant],
        paddingClasses[padding],
        className,
      )}
      {...props}
    />
  );
});
