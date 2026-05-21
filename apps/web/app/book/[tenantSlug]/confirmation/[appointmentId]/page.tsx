import { ConfirmationCard, type ConfirmationData } from './ConfirmationCard';

// Server-rendered confirmation page (docs/04-booking-flow.md §B Step 5
// + "Not You?" escape hatch). Fetches the redacted appointment payload
// server-side so the page is meaningful with JS disabled / on first
// paint. The "This isn't me" interactions are client-component.
//
// URL: /book/[tenantSlug]/confirmation/[appointmentId]
// Tenant slug is not currently used by the API (cuid is global), but
// it's in the URL so links can be shared safely + so a future tenant
// scope check has the value at hand.

const API_BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

type FetchResult =
  | { ok: true; data: ConfirmationData }
  | { ok: false; status: number; message: string };

async function fetchConfirmation(appointmentId: string): Promise<FetchResult> {
  const url = new URL(
    `/public/booking/${encodeURIComponent(appointmentId)}/confirmation`,
    API_BASE,
  );
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    return {
      ok: false,
      status: 0,
      message:
        'Could not load your confirmation. Check your connection and refresh.',
    };
  }

  const body: unknown = await res.json().catch(() => null);

  if (res.ok) {
    return { ok: true, data: body as ConfirmationData };
  }

  if (res.status === 404) {
    return {
      ok: false,
      status: 404,
      message: 'This confirmation link is invalid.',
    };
  }
  if (res.status === 410) {
    return {
      ok: false,
      status: 410,
      message:
        'This confirmation link has expired. Check your email for booking details.',
    };
  }

  const msg =
    body && typeof body === 'object' && 'message' in body
      ? String((body as { message?: unknown }).message ?? '')
      : '';
  return {
    ok: false,
    status: res.status,
    message: msg || 'Could not load your confirmation. Try again shortly.',
  };
}

type PageParams = {
  tenantSlug: string;
  appointmentId: string;
};

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { tenantSlug, appointmentId } = await params;

  const result = await fetchConfirmation(appointmentId);

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-surface-3 bg-white px-s8">
        <span className="t-display-sm font-display font-semibold text-ink">
          Wellos
        </span>
      </header>

      <main className="mx-auto w-full max-w-[640px] px-s6 py-s8 md:px-s8">
        {result.ok ? (
          <ConfirmationCard
            data={result.data}
            tenantSlug={tenantSlug}
            appointmentId={appointmentId}
          />
        ) : (
          <section
            className="rounded-2xl border border-surface-3 bg-white p-s7 shadow-sm"
            role="alert"
          >
            <h1 className="t-display-md text-ink">
              {result.status === 410
                ? 'This link has expired'
                : 'We couldn’t find this confirmation'}
            </h1>
            <p className="mt-s3 t-body-md text-ink-soft">{result.message}</p>
          </section>
        )}
      </main>
    </div>
  );
}
