import { ImageIcon } from '@/app/admin/_shell/icons';

import { SectionHeader } from '../_components/SectionHeader';
import { loadStaffDetail } from '../_components/_data';

export default async function StaffFilesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await loadStaffDetail(id);
  return (
    <SectionHeader
      icon={ImageIcon}
      eyebrow="FILES"
      headline={`Files for ${staff.firstName}.`}
      subtitle="Coming soon — same gallery experience as the client Files tab. Upload headshots, licenses, and certifications."
    >
      <div className="rounded-md border border-line bg-surface-2 p-s6 text-center">
        <p className="t-body-md text-ink-3">
          Coming soon — staff file gallery ships in a follow-up.
        </p>
      </div>
    </SectionHeader>
  );
}
