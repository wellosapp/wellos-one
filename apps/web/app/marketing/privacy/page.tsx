import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy · Wellos',
  description: 'How Wellos collects, uses, and protects your data.',
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-s6 py-s12 md:py-[96px]">
      <div className="flex flex-col gap-s4">
        <span className="t-eyebrow text-accent">Legal</span>
        <h1 className="t-display-xl text-ink md:text-[40px]">Privacy</h1>
        <p className="t-body-lg text-ink-soft">
          Wellos collects only the data needed to run your bookings, payments,
          and client communications — and never sells it. This is a placeholder
          policy that will be replaced with the full document before public
          launch.
        </p>
        <p className="t-body-md text-ink-soft">
          Questions? Email{' '}
          <a className="text-accent underline" href="mailto:hello@wellos.one">
            hello@wellos.one
          </a>
          .
        </p>
      </div>
    </article>
  );
}
