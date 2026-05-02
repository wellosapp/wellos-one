'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { Alert, Badge, Button, Card } from '@/components/ui';
import type { Client } from '@/lib/api/clients';
import type {
  MediaAccessClass,
  MediaAsset,
  MediaAssetDetailResponse,
  MediaOwnerType,
} from '@/lib/api/media';
import type { Service } from '@/lib/api/services';
import type { Staff } from '@/lib/api/staff';
import type { WhoamiLocation } from '@/lib/api/whoami';

import { MediaDetailDrawer } from './MediaDetailDrawer';
import { MediaFilters } from './MediaFilters';
import { MediaGrid } from './MediaGrid';
import { UploadPanel } from './UploadPanel';

export type MediaDirectory = {
  locations: WhoamiLocation[];
  staff: Staff[];
  services: Service[];
  clients: Client[];
  tenantId: string | null;
};

export type MediaFiltersState = {
  ownerType?: MediaOwnerType;
  ownerId?: string;
  accessClass?: MediaAccessClass;
  folder?: string;
  includeArchived: boolean;
};

interface MediaLibraryProps {
  assets: MediaAsset[];
  total: number;
  pageSize: number;
  skip: number;
  filters: MediaFiltersState;
  directory: MediaDirectory;
  selected: MediaAssetDetailResponse | null;
  selectedError: string | null;
  uploadOpen: boolean;
}

export function MediaLibrary({
  assets,
  total,
  pageSize,
  skip,
  filters,
  directory,
  selected,
  selectedError,
  uploadOpen,
}: MediaLibraryProps) {
  const router = useRouter();

  // Build hrefs that preserve the active filter set + pagination cursor.
  const buildHref = useCallback(
    (overrides: Record<string, string | undefined>): string => {
      const params = new URLSearchParams();
      if (filters.ownerType) params.set('ownerType', filters.ownerType);
      if (filters.ownerId) params.set('ownerId', filters.ownerId);
      if (filters.accessClass) params.set('accessClass', filters.accessClass);
      if (filters.folder) params.set('folder', filters.folder);
      if (filters.includeArchived) params.set('includeArchived', 'true');
      if (skip > 0) params.set('skip', String(skip));
      for (const [k, v] of Object.entries(overrides)) {
        if (v === undefined || v === '') params.delete(k);
        else params.set(k, v);
      }
      const qs = params.toString();
      return qs ? `/admin/media?${qs}` : '/admin/media';
    },
    [filters, skip],
  );

  const hrefForAsset = useCallback(
    (assetId: string) => buildHref({ selected: assetId }),
    [buildHref],
  );

  const hrefCloseDrawer = useMemo(() => buildHref({ selected: undefined }), [
    buildHref,
  ]);

  const hrefUploadOpen = useMemo(() => buildHref({ upload: '1' }), [buildHref]);
  const hrefCloseUpload = useMemo(() => buildHref({ upload: undefined }), [
    buildHref,
  ]);

  const handleCloseDrawer = useCallback(() => {
    router.push(hrefCloseDrawer as Route);
  }, [router, hrefCloseDrawer]);

  const handleCloseUpload = useCallback(() => {
    router.push(hrefCloseUpload as Route);
  }, [router, hrefCloseUpload]);

  const showingFrom = total === 0 ? 0 : skip + 1;
  const showingTo = Math.min(skip + pageSize, total);
  const hasPrev = skip > 0;
  const hasNext = skip + pageSize < total;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.floor(skip / pageSize) + 1;

  return (
    <div className="flex flex-col gap-s5">
      <header className="flex flex-wrap items-center justify-between gap-s4">
        <div className="flex flex-col gap-s1">
          <span className="t-eyebrow text-accent">Media</span>
          <h1 className="t-display-lg flex items-baseline gap-s3">
            Media library
            {filters.includeArchived && (
              <Badge tone="amber">Including archived</Badge>
            )}
          </h1>
          <p className="t-body-sm text-ink-soft">
            {total === 0
              ? 'No media yet'
              : `Showing ${showingFrom}–${showingTo} of ${total} asset${total === 1 ? '' : 's'} · page ${currentPage} of ${totalPages}`}
          </p>
        </div>
        <Link href={hrefUploadOpen as Route} className="no-underline">
          <Button variant="accent" size="md">
            + Upload
          </Button>
        </Link>
      </header>

      {selectedError && <Alert tone="error">{selectedError}</Alert>}

      <MediaFilters
        filters={filters}
        directory={directory}
        buildHref={buildHref}
      />

      {assets.length === 0 ? (
        <Card padding="lg">
          <div className="flex flex-col gap-s2">
            <p className="t-body-md text-ink-soft">
              No media match the current filters.
            </p>
            <p className="t-body-sm text-ink-soft">
              Try clearing filters above, or upload your first asset.
            </p>
          </div>
        </Card>
      ) : (
        <MediaGrid
          assets={assets}
          hrefForAsset={hrefForAsset}
          selectedAssetId={selected?.asset.id ?? null}
        />
      )}

      {(hasPrev || hasNext) && (
        <nav
          aria-label="Media pagination"
          className="flex items-center justify-between gap-s4 border-t border-surface-3 pt-s4"
        >
          <div className="t-body-sm text-ink-soft">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex items-center gap-s2">
            {hasPrev ? (
              <Link
                href={
                  buildHref({
                    skip:
                      skip - pageSize > 0 ? String(skip - pageSize) : undefined,
                  }) as Route
                }
                className="no-underline"
              >
                <Button variant="ghost" size="sm">
                  ← Newer
                </Button>
              </Link>
            ) : (
              <Button variant="ghost" size="sm" disabled>
                ← Newer
              </Button>
            )}
            {hasNext ? (
              <Link
                href={buildHref({ skip: String(skip + pageSize) }) as Route}
                className="no-underline"
              >
                <Button variant="ghost" size="sm">
                  Older →
                </Button>
              </Link>
            ) : (
              <Button variant="ghost" size="sm" disabled>
                Older →
              </Button>
            )}
          </div>
        </nav>
      )}

      {selected && (
        <MediaDetailDrawer
          detail={selected}
          directory={directory}
          onClose={handleCloseDrawer}
        />
      )}

      {uploadOpen && (
        <UploadPanel
          directory={directory}
          onClose={handleCloseUpload}
          defaultOwnerType={filters.ownerType}
          defaultOwnerId={filters.ownerId}
          defaultFolder={filters.folder}
          defaultAccessClass={filters.accessClass}
        />
      )}
    </div>
  );
}
