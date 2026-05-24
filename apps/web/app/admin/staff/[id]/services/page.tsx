import { GridIcon } from '@/app/admin/_shell/icons';
import { listServices } from '@/lib/api/services';

import { SectionHeader } from '../_components/SectionHeader';
import { loadStaffDetail } from '../_components/_data';
import { ServicesPicker } from './ServicesPicker';

export default async function StaffServicesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await loadStaffDetail(id);
  const { services } = await listServices({ active: true, take: 200 });

  return (
    <div className="flex flex-col gap-s6">
      <SectionHeader
        icon={GridIcon}
        eyebrow="SERVICES"
        headline={`What ${staff.firstName} performs.`}
        subtitle="Assign services this staff member can be booked for. Active services from the tenant catalog only — manage services themselves at Services in the admin nav."
      >
        <ServicesPicker
          staffId={id}
          services={services.map((s) => ({
            id: s.id,
            name: s.name,
            color: s.color,
            durationMinutes: s.durationMinutes,
            basePriceCents: s.basePriceCents,
            category: s.category,
          }))}
          initialServiceIds={staff.serviceIds}
          readOnly={Boolean(staff.deletedAt)}
        />
      </SectionHeader>
    </div>
  );
}
