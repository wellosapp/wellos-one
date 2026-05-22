import { ImageIcon } from '@/app/admin/_shell/icons';
import { ApiError } from '@/lib/api/client';
import { listMediaAssets } from '@/lib/api/media';
import { cn } from '@/lib/cn';

import { SectionHeader } from '../_components/SectionHeader';
import { FilesDropzone } from './FilesDropzone';
import { FilesGrid } from './FilesGrid';

export default async function ClientFilesTabPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let assets: Awaited<ReturnType<typeof listMediaAssets>>['assets'] = [];
  let loadError: string | null = null;
  try {
    const res = await listMediaAssets({
      ownerType: 'client',
      ownerId: id,
      take: 200,
    });
    assets = res.assets;
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? err.message
        : 'Could not load files. Is the API running?';
  }

  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
      )}
    >
      <header className="border-b border-line/70 bg-surface-sunk/40 px-s6 py-s5 lg:px-s8 lg:py-s6">
        <SectionHeader
          icon={ImageIcon}
          eyebrow="FILES"
          headline="Documents & media for this client."
          subtitle="Photos, paperwork, and attachments shared with this profile. Anything uploaded here is stored in tenant-scoped Cloudflare R2 and only visible to staff."
        />
      </header>

      <div className="flex flex-col gap-s5 p-s6 lg:p-s8">
        <FilesDropzone clientId={id} />

        {loadError ? (
          <div
            className={cn(
              'rounded-md border border-red/30 bg-red-pale/40 p-s4',
              't-body-sm text-red',
            )}
          >
            {loadError}
          </div>
        ) : (
          <FilesGrid assets={assets} clientId={id} />
        )}
      </div>
    </section>
  );
}
