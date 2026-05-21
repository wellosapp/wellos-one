import Link from 'next/link';

import { Button } from '@/components/ui';

import { SIGN_IN_URL, SIGN_UP_URL } from './links';
import { Wordmark } from './Wordmark';

const NAV_ITEMS: Array<{ label: string; href: string }> = [
  { label: 'Features', href: '/#features' },
  { label: 'How it works', href: '/#how' },
  { label: 'Pricing', href: '/#pricing' },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-surface-3/70 bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/65">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-s4 px-s6 py-s4">
        <Link href="/" aria-label="Wellos home" className="rounded-sm focus-visible:shadow-focus focus-visible:outline-none">
          <Wordmark size="md" />
        </Link>

        <nav className="hidden items-center gap-s6 md:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="t-body-md text-ink-soft transition-colors duration-fast hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-s3">
          <a
            href={SIGN_IN_URL}
            className="t-body-md hidden text-ink-soft transition-colors duration-fast hover:text-ink sm:inline-flex"
          >
            Log in
          </a>
          <a href={SIGN_UP_URL}>
            <Button variant="accent" size="md">
              Get started
            </Button>
          </a>
        </div>
      </div>
    </header>
  );
}
