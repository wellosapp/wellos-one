// Joins the 6 address fields into a single human-readable string for the
// collapsed mailing-address display. Empty parts are skipped so a client
// with only a city + state still composes cleanly. When every part is
// empty the helper returns a sensible empty-state string so the input
// always has visible content.

export function composeMailingAddress(client: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string {
  const line1 = (client.addressLine1 ?? '').trim();
  const line2 = (client.addressLine2 ?? '').trim();
  const city = (client.city ?? '').trim();
  const state = (client.state ?? '').trim();
  const postal = (client.postalCode ?? '').trim();
  const country = (client.country ?? '').trim();

  const head = [line1, line2].filter(Boolean).join(' ');
  const cityStateZip = [city, [state, postal].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' ');

  const composed = [head, cityStateZip, country]
    .filter((part) => part.length > 0)
    .join(', ');

  return composed.length > 0 ? composed : 'No address on file.';
}
