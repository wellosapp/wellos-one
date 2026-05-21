import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About · Wellos',
  description: 'Why we built Wellos.',
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-s6 py-s12 md:py-[96px]">
      <div className="flex flex-col gap-s4">
        <span className="t-eyebrow text-accent">About</span>
        <h1 className="t-display-xl text-ink md:text-[40px]">
          We build the tools we wished existed.
        </h1>
        <p className="t-body-lg text-ink-soft">
          Wellos is a small team building the platform we couldn’t find for our
          own friends and family who run boutique studios. Bookings, payments,
          messaging, and intake — together, finally.
        </p>
      </div>
    </article>
  );
}
