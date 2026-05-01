import type { PrismaClient, TenantMediaRoot } from '@prisma/client';

// Accepts either the extended ExtendedPrismaClient (used by Fastify
// services) or a raw PrismaClient (used by one-shot scripts like
// bootstrap-admin). The function only touches the tenantMediaRoot
// model which has no soft-delete extension behavior, so the extension
// is irrelevant here.
type MinimalPrisma = Pick<PrismaClient, 'tenantMediaRoot'>;

// Tenant media-root provisioning (E3-S4g).
//
// Creates the TenantMediaRoot row that records which R2 buckets a tenant
// uses + the per-tenant key prefix. Required by the R2 buildout spec
// §2.4 — every tenant has a row before any media upload happens.
//
// MVP layout (single-bucket):
//   publicBucket    = $R2_BUCKET_NAME (default: wellos-files-prod)
//   privateBucket   = $R2_BUCKET_NAME (same bucket; access tier is governed
//                     at the URL layer — public CDN vs signed-and-short)
//   protectedBucket = null (Phase 2 — separate bucket for medspa records)
//   rootPrefix      = "tenants/{tenantId}/"
//   cdnBaseUrl      = $R2_PUBLIC_URL (e.g. https://files.wellos.one)
//
// Idempotent — upsert by tenantId. Safe to call from bootstrap-admin,
// Clerk-webhook tenant-creation flows, or a future onboarding wizard.

const REQUIRED_ENV = ['R2_BUCKET_NAME', 'R2_PUBLIC_URL'] as const;

export class MediaRootEnvError extends Error {
  code = 'MEDIA_ROOT_ENV_MISSING' as const;
  missing: string[];
  constructor(missing: string[]) {
    super(
      `Cannot provision TenantMediaRoot — missing env: ${missing.join(', ')}. ` +
        'Set the R2_* vars per the pre-launch sweep tracker before creating tenants in production.',
    );
    this.name = 'MediaRootEnvError';
    this.missing = missing;
  }
}

export type ProvisionResult = {
  status: 'created' | 'existing';
  root: TenantMediaRoot;
};

export async function provisionTenantMediaRoot(
  prisma: MinimalPrisma,
  args: { tenantId: string },
): Promise<ProvisionResult> {
  const { tenantId } = args;

  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new MediaRootEnvError(missing);
  }

  const publicBucket = process.env.R2_BUCKET_NAME!;
  const privateBucket = publicBucket; // single-bucket MVP
  const cdnBaseUrl = process.env.R2_PUBLIC_URL!.replace(/\/+$/, '');
  const rootPrefix = `tenants/${tenantId}/`;

  // Upsert by tenantId (the unique constraint). On collision, treat as
  // existing — don't overwrite cdnBaseUrl in case ops have manually
  // tweaked it.
  const existing = await prisma.tenantMediaRoot.findUnique({
    where: { tenantId },
  });
  if (existing) {
    return { status: 'existing', root: existing };
  }

  const root = await prisma.tenantMediaRoot.create({
    data: {
      tenantId,
      publicBucket,
      privateBucket,
      protectedBucket: null, // Phase 2
      rootPrefix,
      cdnBaseUrl,
    },
  });
  return { status: 'created', root };
}
