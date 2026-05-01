/**
 * Smoke for E3-S4c (Media + R2 SDK).
 *
 * Two modes — detected at startup:
 *   FULL    — all R2_* env vars set. Runs presign → upload → complete →
 *             display URL → archive → soft-delete end-to-end.
 *   DB_ONLY — R2 env unset. Skips presign/complete/displayUrl. Verifies
 *             list/get/update/archive/soft-delete using a directly-inserted
 *             MediaAsset row (no R2 round-trip).
 *
 * Run: pnpm --filter @wellos/api exec tsx scripts/smoke-media.ts
 *
 * Hard-deletes the test row at the end. audit_log rows stay (append-only).
 * In FULL mode the R2 object also stays (R2 cleanup is a follow-up).
 */

import { PrismaClient } from '@prisma/client';

import { softDeleteExtension } from '../src/db/softDelete.js';
import {
  R2NotConfiguredError,
  buildObjectKey,
  computePublicUrl,
  headObject,
  presignUpload,
} from '../src/integrations/r2.js';
import {
  InvalidMediaReferenceError,
  completeMediaUpload,
  getDisplayUrl,
  getMediaAssetById,
  listMediaAssets,
  presignMediaUpload,
  setMediaAssetArchived,
  softDeleteMediaAsset,
  updateMediaAsset,
} from '../src/services/mediaService.js';

const prismaBase = new PrismaClient({ log: ['error'] });
const prisma = prismaBase.$extends(softDeleteExtension);

const created: string[] = [];
const steps: { ok: boolean; name: string; detail?: string }[] = [];
function pass(name: string, detail?: string) {
  steps.push({ ok: true, name, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  steps.push({ ok: false, name, detail: msg });
  console.log(`  ✗ ${name} — ${msg}`);
}
function skip(name: string, reason: string) {
  console.log(`  · ${name} — skipped (${reason})`);
}

function r2Configured(): boolean {
  return [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_URL',
  ].every((k) => Boolean(process.env[k]));
}

async function main() {
  const mode = r2Configured() ? 'FULL' : 'DB_ONLY';
  console.log(`E3-S4c smoke — mode=${mode}\n`);

  const tenant = await prisma.tenant.findFirst({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!tenant) throw new Error('No tenant');
  console.log(`tenant: ${tenant.name} (${tenant.id})`);

  const adminAssignment = await prisma.roleAssignment.findFirst({
    where: { tenantId: tenant.id, role: { name: 'admin' } },
    select: { userId: true },
  });
  if (!adminAssignment) throw new Error('No admin user');
  const actorUserId = adminAssignment.userId;
  console.log(`admin: ${actorUserId}`);

  const client = await prisma.client.findFirst({
    where: { tenantId: tenant.id, deletedAt: null },
    select: { id: true, firstName: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!client) throw new Error('No client');
  console.log(`client: ${client.firstName} (${client.id})\n`);

  // ===== R2 env shape sanity =====
  if (mode === 'FULL') {
    const head = await headObject({ objectKey: 'smoke/__nonexistent__' });
    if (head.exists) {
      fail('R2 reachability', 'unexpected hit on nonexistent key');
    } else {
      pass('R2 reachability (HeadObject 404 path)');
    }
  } else {
    skip('R2 reachability', 'R2 env unset');
  }

  let assetId: string | null = null;

  // ===== Create the asset =====
  if (mode === 'FULL') {
    try {
      const r = await presignMediaUpload(prisma, {
        tenantId: tenant.id,
        actorUserId,
        body: {
          ownerType: 'client',
          ownerId: client.id,
          folder: 'references',
          fileName: 'smoke-test.txt',
          mimeType: 'text/plain',
          sizeBytes: 21, // 'hello from S4c smoke\n'.length === 21
          accessClass: 'tenant_staff',
          altText: '[E3-S4c smoke] reference',
        },
      });
      assetId = r.asset.id;
      created.push(r.asset.id);
      pass('presign', `id=${r.asset.id}`);

      // Upload via the presigned URL.
      const body = 'hello from S4c smoke\n';
      const uploadRes = await fetch(r.upload.url, {
        method: 'PUT',
        headers: r.upload.headers,
        body,
      });
      if (!uploadRes.ok) {
        fail(
          'PUT to presigned URL',
          `${uploadRes.status} ${uploadRes.statusText}`,
        );
      } else {
        pass('PUT to presigned URL');
      }

      // /complete verifies the object via HeadObject + cross-checks size.
      const completed = await completeMediaUpload(prisma, {
        tenantId: tenant.id,
        actorUserId,
        id: r.asset.id,
        body: {},
      });
      if (!completed) throw new Error('null result');
      if (!completed.asset.uploadedAt)
        throw new Error('uploadedAt not stamped');
      pass('complete', `uploadedAt=${completed.asset.uploadedAt.toISOString()}`);

      // Display URL — for tenant_staff accessClass, expect signed GET URL.
      const url = await getDisplayUrl(completed.asset);
      if (!url.includes('X-Amz-Signature') && !url.includes('X-Amz-Algorithm')) {
        // Some signed URLs use lowercase params — accept either.
        if (!url.includes('Signature') && !url.includes('Algorithm')) {
          fail('display URL signed', `unexpected: ${url.slice(0, 80)}...`);
        }
      } else {
        pass('display URL signed (tenant_staff)');
      }
    } catch (err) {
      fail('presign + upload + complete', err);
    }
  } else {
    // DB_ONLY: insert a row directly, mark uploadedAt to simulate post-complete.
    try {
      const objectKey = buildObjectKey({
        tenantId: tenant.id,
        ownerType: 'client',
        ownerId: client.id,
        folder: 'references',
        assetId: 'smoke-test',
        fileName: 'smoke.txt',
      });
      const a = await prismaBase.mediaAsset.create({
        data: {
          tenantId: tenant.id,
          bucket: 'smoke-bucket',
          objectKey,
          accessClass: 'tenant_staff',
          ownerType: 'client',
          clientOwnerId: client.id,
          folder: 'references',
          fileName: 'smoke.txt',
          mimeType: 'text/plain',
          sizeBytes: BigInt(21),
          altText: '[E3-S4c smoke] DB-only',
          uploadedAt: new Date(),
        },
      });
      assetId = a.id;
      created.push(a.id);
      pass('seed asset directly (DB_ONLY)', `id=${a.id}`);
    } catch (err) {
      fail('seed asset', err);
    }
  }

  if (!assetId) {
    console.log('\nbailing — no assetId');
    return;
  }

  // ===== Cross-tenant lookup → null =====
  try {
    const r = await getMediaAssetById(prisma, {
      tenantId: 'tenant_does_not_exist',
      id: assetId,
    });
    if (r !== null) throw new Error('expected null cross-tenant');
    pass('cross-tenant get returns null');
  } catch (err) {
    fail('cross-tenant', err);
  }

  // ===== List with filter =====
  try {
    const r = await listMediaAssets(prisma, {
      tenantId: tenant.id,
      query: {
        ownerType: 'client',
        ownerId: client.id,
        take: 50,
        skip: 0,
        includeArchived: false,
      },
    });
    if (!r.assets.find((a) => a.id === assetId))
      throw new Error('seeded asset not in list');
    pass('list (filter ownerType=client + ownerId)', `count=${r.assets.length}`);
  } catch (err) {
    fail('list', err);
  }

  // ===== Update altText / caption =====
  try {
    const r = await updateMediaAsset(prisma, {
      tenantId: tenant.id,
      actorUserId,
      id: assetId,
      body: { caption: '[E3-S4c smoke] caption v2' },
    });
    if (!r || r.asset.caption !== '[E3-S4c smoke] caption v2')
      throw new Error('caption not set');
    pass('update caption');
  } catch (err) {
    fail('update', err);
  }

  // ===== Archive / unarchive =====
  try {
    const r1 = await setMediaAssetArchived(prisma, {
      tenantId: tenant.id,
      actorUserId,
      id: assetId,
      archived: true,
    });
    if (!r1?.asset.archivedAt) throw new Error('archivedAt not set');
    const r2 = await setMediaAssetArchived(prisma, {
      tenantId: tenant.id,
      actorUserId,
      id: assetId,
      archived: false,
    });
    if (r2?.asset.archivedAt !== null) throw new Error('archivedAt not cleared');
    pass('archive + unarchive');
  } catch (err) {
    fail('archive', err);
  }

  // ===== Soft-delete =====
  try {
    const r = await softDeleteMediaAsset(prisma, {
      tenantId: tenant.id,
      actorUserId,
      id: assetId,
    });
    if (!r.deleted) throw new Error('deleted=false');
    pass('soft-delete');
  } catch (err) {
    fail('soft-delete', err);
  }

  // ===== Presign rejects R2_NOT_CONFIGURED gracefully (DB_ONLY mode) =====
  if (mode === 'DB_ONLY') {
    try {
      await presignMediaUpload(prisma, {
        tenantId: tenant.id,
        actorUserId,
        body: {
          ownerType: 'client',
          ownerId: client.id,
          folder: 'references',
          fileName: 'noop.txt',
          mimeType: 'text/plain',
          sizeBytes: 1,
          accessClass: 'tenant_staff',
        },
      });
      fail('R2 unconfigured rejection', 'expected throw');
    } catch (err) {
      if (err instanceof R2NotConfiguredError) {
        pass('R2 unconfigured throws cleanly', `missing=${err.missing.join(',')}`);
      } else {
        fail('R2 unconfigured rejection', err);
      }
    }
  }

  // ===== Cleanup =====
  console.log('\nCleanup...');
  if (created.length > 0) {
    const r = await prismaBase.mediaAsset.deleteMany({
      where: { id: { in: created } },
    });
    console.log(`  hard-deleted ${r.count} test MediaAsset row(s)`);
    if (mode === 'FULL') {
      console.log(
        '  note: R2 object remains; manual cleanup or a TTL sweeper for the test prefix is a follow-up',
      );
    }
  }

  const failed = steps.filter((s) => !s.ok);
  console.log(`\n${steps.length - failed.length}/${steps.length} steps passed (mode=${mode})`);
  if (failed.length > 0) process.exitCode = 1;
}

// computePublicUrl is exported but only used in FULL mode — silence the
// unused-import lint warning by referencing it in a no-op.
void computePublicUrl;

main()
  .catch((err) => {
    console.error('\nfatal:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaBase.$disconnect();
  });
