const STEPS: Array<{ n: string; title: string; body: string }> = [
  {
    n: '01',
    title: 'Connect',
    body: 'Sign up, bring your team, set your hours. Five minutes, no migration consultant required.',
  },
  {
    n: '02',
    title: 'Configure',
    body: 'Add services, intake forms, deposit rules. Sensible defaults for every vertical we serve.',
  },
  {
    n: '03',
    title: 'Share',
    body: 'Drop your booking link in bio, on socials, on a QR card at the front desk. Clients self-serve.',
  },
  {
    n: '04',
    title: 'Run',
    body: 'Calendar fills up. Reminders go out. Payments reconcile. You focus on the work.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="relative bg-surface-2/60 py-s12 md:py-[96px]">
      <div className="mx-auto max-w-6xl px-s6">
        <div className="mb-s10 flex flex-col gap-s3 md:max-w-[560px]">
          <span className="t-eyebrow text-accent">How it works</span>
          <h2 className="t-display-xl text-ink md:text-[36px]">
            Four steps from &ldquo;what is this&rdquo; to a booked day.
          </h2>
        </div>

        <ol className="grid gap-s4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="relative flex flex-col gap-s3 rounded-lg bg-white p-s6 shadow-sm"
            >
              <span className="t-eyebrow text-accent">{step.n}</span>
              <h3 className="t-display-sm text-ink">{step.title}</h3>
              <p className="t-body-md text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
