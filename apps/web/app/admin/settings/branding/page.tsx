import { GridIcon } from '@/app/admin/_shell/icons';
import { ApiError } from '@/lib/api/client';
import { getTenantBrand } from '@/lib/api/tenant-brand';
import { cn } from '@/lib/cn';

import { FALLBACK_BRAND_COLORS } from '../../services/_constants/colors';

import { BrandColorsEditor } from './BrandColorsEditor';
import { updateBrandColorsAction } from './_actions';

// Tenant-wide brand palette. Phase 1 of the Brand Settings epic.
// Logo + fonts + per-tenant CSS variables land in later phases.

export default async function BrandSettingsPage() {
  let initial = [...FALLBACK_BRAND_COLORS];
  let loadError: string | null = null;
  try {
    const { brandColors } = await getTenantBrand();
    if (brandColors.length > 0) {
      initial = brandColors;
    }
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? err.message
        : 'Could not load brand palette. Is the API running?';
  }

  return (
    <div className="flex flex-col gap-s6">
      {/* Section header — inline chrome since this is an /admin/settings
          sub-route, not a client/staff profile section. */}
      <section
        className={cn(
          'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
        )}
      >
        <header
          className={cn(
            'border-b border-line bg-surface-sunk/40',
            'px-s6 py-s5 lg:px-s8 lg:py-s6',
          )}
        >
          <div className="flex items-center gap-s2 t-eyebrow tracking-wide text-sage">
            <GridIcon size={14} />
            <span>BRAND PALETTE</span>
          </div>
          <h2 className="mt-s2 font-display text-[22px] leading-tight text-ink">
            Customize your brand colors.
          </h2>
          <p className="mt-s2 max-w-2xl t-body-md leading-relaxed text-ink-3">
            Used in the service color picker today. The public booking page +
            (future) theme tokens will read from this palette in upcoming
            phases. When empty, the picker uses the Wellos default palette.
          </p>
        </header>
        <div className="px-s6 py-s5 lg:px-s8 lg:py-s6">
          {loadError ? (
            <div
              className={cn(
                'rounded-md border border-amber/30 bg-amber-pale/60 p-s4',
                't-body-sm text-amber',
              )}
            >
              {loadError}
            </div>
          ) : (
            <BrandColorsEditor
              initialColors={initial}
              fallbackColors={[...FALLBACK_BRAND_COLORS]}
              action={updateBrandColorsAction}
            />
          )}
        </div>
      </section>
    </div>
  );
}
