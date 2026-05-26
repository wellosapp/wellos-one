import Link from 'next/link';

import { SIGN_IN_URL, SIGN_UP_URL } from './links';
import { Wordmark } from './Wordmark';

interface FooterColumn {
  heading: string;
  links: Array<{ label: string; href: string; external?: boolean }>;
}

const COLUMNS: FooterColumn[] = [
  {
    heading: 'Product',
    links: [
      { label: 'Calendar', href: '/#features' },
      { label: 'Booking', href: '/#features' },
      { label: 'Clients', href: '/#features' },
      { label: 'Forms', href: '/#features' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: 'mailto:hello@wellos.one', external: true },
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Sign in', href: SIGN_IN_URL, external: true },
      { label: 'Get started', href: SIGN_UP_URL, external: true },
      { label: 'Status', href: 'https://status.wellos.one', external: true },
      { label: 'Help', href: 'mailto:hello@wellos.one', external: true },
    ],
  },
];

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-surface-3/70 bg-surface py-s10">
      <div className="mx-auto max-w-6xl px-s6">
        <div className="grid gap-s8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-s3">
            <Wordmark size="md" />
            <p className="t-body-md max-w-[34ch] text-ink-soft">
              Booking, payments, messaging, and intake — built for boutique
              businesses that take their craft seriously.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading} className="flex flex-col gap-s3">
              <h4 className="t-eyebrow text-ink-soft">{col.heading}</h4>
              <ul className="flex flex-col gap-s2">
                {col.links.map((link) => (
                  <li key={`${col.heading}-${link.label}`}>
                    {link.external ? (
                      <a
                        href={link.href}
                        className="t-body-md text-ink transition-colors duration-fast hover:text-accent"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href as never}
                        className="t-body-md text-ink transition-colors duration-fast hover:text-accent"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-s10 flex flex-col gap-s2 border-t border-surface-3/70 pt-s5 md:flex-row md:items-center md:justify-between">
          <p className="t-caption text-ink-soft">
            © {year} Wellos. Built for boutique businesses.
          </p>
          <p className="t-caption text-ink-soft">
            wellos.one
          </p>
        </div>
      </div>
    </footer>
  );
}
