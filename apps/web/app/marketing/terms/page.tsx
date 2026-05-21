import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms · Wellos',
  description: 'Terms of service for using Wellos.',
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-s6 py-s12 md:py-[96px]">
      <div className="flex flex-col gap-s4">
        <span className="t-eyebrow text-accent">Legal</span>
        <h1 className="t-display-xl text-ink md:text-[40px]">Terms of service</h1>
        <p className="t-body-lg text-ink-soft">
          By using Wellos you agree to operate within the laws of your
          jurisdiction and the standards of your profession. This is a
          placeholder document that will be replaced with the full terms before
          public launch.
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
