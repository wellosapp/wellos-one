import type { ExtendedPrismaClient } from '../db/client.js';

export type PublicBookingCatalogWire = {
  locations: Array<{ id: string; name: string; timezone: string }>;
  services: Array<{
    id: string;
    name: string;
    descriptionShort: string | null;
    durationMinutes: number;
    basePriceCents: number;
    staffIds: string[];
  }>;
  staff: Array<{ id: string; displayName: string }>;
};

function staffDisplayName(firstName: string, lastName: string | null): string {
  const parts = [firstName, lastName].filter(Boolean);
  return parts.length ? parts.join(' ') : 'Staff';
}

export async function resolvePublicBookingTenant(
  prisma: ExtendedPrismaClient,
  args: {
    tenantSlug?: string;
    /** Dev-only bypass — gated by ALLOW_PUBLIC_BOOKING_DEV_TENANT_HEADER. */
    devTenantIdHeader?: string;
  },
): Promise<{ tenantId: string; slug: string } | null> {
  const allowHeader =
    process.env.ALLOW_PUBLIC_BOOKING_DEV_TENANT_HEADER === 'true';

  if (allowHeader && args.devTenantIdHeader) {
    const byId = await prisma.tenant.findFirst({
      where: { id: args.devTenantIdHeader.trim() },
      select: { id: true, slug: true },
    });
    return byId ? { tenantId: byId.id, slug: byId.slug } : null;
  }

  const slug = args.tenantSlug?.trim();
  if (!slug) return null;

  const row = await prisma.tenant.findFirst({
    where: { slug },
    select: { id: true, slug: true },
  });
  return row ? { tenantId: row.id, slug: row.slug } : null;
}

export async function getPublicBookingCatalog(
  prisma: ExtendedPrismaClient,
  tenantId: string,
): Promise<PublicBookingCatalogWire> {
  const [locations, serviceRows] = await Promise.all([
    prisma.location.findMany({
      where: { tenantId },
      select: { id: true, name: true, timezone: true },
      orderBy: { name: 'asc' },
    }),
    prisma.service.findMany({
      where: {
        tenantId,
        active: true,
        publicVisible: true,
      },
      select: {
        id: true,
        name: true,
        descriptionShort: true,
        durationMinutes: true,
        basePriceCents: true,
        staff: {
          select: {
            staff: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                active: true,
              },
            },
          },
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    }),
  ]);

  const staffMap = new Map<string, { id: string; displayName: string }>();

  const services: PublicBookingCatalogWire['services'] = [];

  for (const s of serviceRows) {
    const staffIds: string[] = [];
    for (const link of s.staff) {
      const st = link.staff;
      if (!st.active) continue;
      staffIds.push(st.id);
      if (!staffMap.has(st.id)) {
        staffMap.set(st.id, {
          id: st.id,
          displayName: staffDisplayName(st.firstName, st.lastName),
        });
      }
    }
    if (staffIds.length === 0) continue;
    services.push({
      id: s.id,
      name: s.name,
      descriptionShort: s.descriptionShort,
      durationMinutes: s.durationMinutes,
      basePriceCents: s.basePriceCents,
      staffIds,
    });
  }

  const staff = [...staffMap.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName),
  );

  return { locations, services, staff };
}
