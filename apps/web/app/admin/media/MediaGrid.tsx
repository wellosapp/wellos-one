'use client';

import Link from 'next/link';
import type { Route } from 'next';

import type { MediaAsset } from '@/lib/api/media';

import { MediaAssetCard } from './MediaAssetCard';

interface MediaGridProps {
  assets: MediaAsset[];
  hrefForAsset: (assetId: string) => string;
  selectedAssetId: string | null;
}

export function MediaGrid({
  assets,
  hrefForAsset,
  selectedAssetId,
}: MediaGridProps) {
  return (
    <ul
      role="list"
      className="grid grid-cols-2 gap-s3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6"
    >
      {assets.map((asset) => (
        <li key={asset.id}>
          <Link
            href={hrefForAsset(asset.id) as Route}
            className="block no-underline"
            aria-label={`Open ${asset.fileName}`}
          >
            <MediaAssetCard
              asset={asset}
              isSelected={asset.id === selectedAssetId}
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
