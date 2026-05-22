// Pure helper — produces the design's single-line mailing-address display
// from the 6 address columns Client carries. Used by the collapsed state of
// `MailingAddressField`. Empty fields skipped; all empty -> empty-state copy.

export function composeMailingAddress(client: {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string {
  const line1 = client.addressLine1?.trim();
  const city = client.city?.trim();
  const state = client.state?.trim();
  const postalCode = client.postalCode?.trim();

  // Format: "1422 SE Stark St, Portland OR 97214"
  const parts: string[] = [];
  if (line1) parts.push(line1);

  const cityStateZip = [city, [state, postalCode].filter(Boolean).join(' ')]
    .filter((s) => s && s.length > 0)
    .join(' ');
  if (cityStateZip) parts.push(cityStateZip);

  if (parts.length === 0) return 'No address on file.';
  return parts.join(', ');
}
