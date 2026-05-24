// Brand color palette for the service color picker.
//
// TODO(brand-settings-epic): when the Tenant.brandColors JSONB field lands,
// add a server-side loader like apps/web/lib/api/tenant.ts:getTenantBrandColors()
// that reads tenant.brandColors ?? FALLBACK_BRAND_COLORS, and pass it through
// to ServiceForm via a `presets` prop. The picker already accepts that prop
// — no component changes needed. See PR description §"Future-swap plan."

export type BrandColor = {
  /** Display name shown in the chip tooltip and the "Selected: ●" caption. */
  name: string;
  /** 6-digit uppercase hex string with leading #. */
  hex: string;
};

export const FALLBACK_BRAND_COLORS: ReadonlyArray<BrandColor> = [
  { name: 'Sage',       hex: '#3D7A5E' },
  { name: 'Terracotta', hex: '#C2755A' },
  { name: 'Plum',       hex: '#7B5E7A' },
  { name: 'Sky',        hex: '#5E7A92' },
  { name: 'Sand',       hex: '#B8A082' },
  { name: 'Forest',     hex: '#2C5444' },
  { name: 'Coral',      hex: '#D88A6B' },
  { name: 'Slate',      hex: '#5A5A6A' },
];

/**
 * Return the preset name for a hex value (case-insensitive match), or null if
 * the hex doesn't match any preset. Used by the picker's "Selected: ● {name}"
 * caption to label whether the current color is from the brand palette or a
 * custom choice.
 */
export function findPresetName(
  hex: string,
  presets: ReadonlyArray<BrandColor> = FALLBACK_BRAND_COLORS,
): string | null {
  const normalized = hex.trim().toUpperCase();
  if (!normalized) return null;
  const match = presets.find((p) => p.hex.toUpperCase() === normalized);
  return match?.name ?? null;
}
