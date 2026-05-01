import { createHash } from 'node:crypto';

import {
  HeadObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import {
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Cloudflare R2 wrapper used by the media-asset endpoints (E3-S4c).
//
// R2 is S3-compatible, so we use the AWS SDK with a Cloudflare endpoint.
// Endpoint format: https://{accountId}.r2.cloudflarestorage.com
//
// Env vars (Railway @wellos/api + local apps/api/.env):
//   R2_ACCOUNT_ID
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET_NAME           (default: wellos-files-prod)
//   R2_PUBLIC_URL            (custom domain serving public-CDN assets)
//
// Fail-fast on missing env: the client is built on first use, NOT at module
// load. That keeps the API booting in dev environments where R2 isn't
// configured (the routes that call into this just 503). Per the plan in
// pre-launch sweep tracker (2026-04-30 row, item 8).

const REQUIRED_ENV = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
] as const;

export class R2NotConfiguredError extends Error {
  code = 'R2_NOT_CONFIGURED' as const;
  missing: string[];
  constructor(missing: string[]) {
    super(
      `R2 environment is incomplete. Missing: ${missing.join(', ')}. ` +
        'Set the R2_* vars in apps/api/.env (local) and Railway env (prod). ' +
        'See pre-launch sweep tracker for the full provisioning checklist.',
    );
    this.name = 'R2NotConfiguredError';
    this.missing = missing;
  }
}

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
};

let cachedClient: S3Client | null = null;
let cachedConfig: R2Config | null = null;

function loadConfig(): R2Config {
  if (cachedConfig) return cachedConfig;

  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new R2NotConfiguredError(missing);
  }

  // Strip trailing slash off publicUrl so callers can join paths cleanly.
  const publicUrl = process.env.R2_PUBLIC_URL!.replace(/\/+$/, '');

  cachedConfig = {
    accountId: process.env.R2_ACCOUNT_ID!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    bucketName: process.env.R2_BUCKET_NAME!,
    publicUrl,
  };
  return cachedConfig;
}

function client(): { s3: S3Client; config: R2Config } {
  if (cachedClient) return { s3: cachedClient, config: cachedConfig! };

  const config = loadConfig();
  const opts: S3ClientConfig = {
    region: 'auto', // R2 ignores region but the SDK demands a string
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  };
  cachedClient = new S3Client(opts);
  return { s3: cachedClient, config };
}

// Build the canonical R2 object key for a tenant-scoped asset. Per the
// R2 buildout spec §2.6:
//   tenants/{tenantId}/{ownerType}/{ownerId}/{folder}/{id}-{safeFileName}
//
// The {id} prefix on the filename prevents collisions if the same client
// uploads two files named "front.jpg" — and the safeFileName keeps the
// extension visible at storage layer for content-disposition + debugging.
//
// safeFileName: lowercase, ASCII-only, spaces→dashes, trim non-[a-z0-9.-]
// down to dashes, collapse runs of dashes, cap at 100 chars.
export function buildObjectKey(args: {
  tenantId: string;
  ownerType: string;
  ownerId: string;
  folder: string;
  assetId: string;
  fileName: string;
}): string {
  const safe = args.fileName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9.\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100) || 'file';
  return `tenants/${args.tenantId}/${args.ownerType}/${args.ownerId}/${args.folder}/${args.assetId}-${safe}`;
}

// Public CDN URL for assets where accessClass='public_booking' (and
// 'generated' for thumbnails). Direct URL — no signing, browser-cacheable.
//
// Caller is responsible for only computing this for assets that should be
// publicly accessible. accessClass='client_owned' / 'tenant_staff' /
// 'protected_medspa' must use presignGet() instead.
export function computePublicUrl(objectKey: string): string {
  const { config } = client();
  return `${config.publicUrl}/${objectKey}`;
}

// Presigned PUT URL for uploading directly from browser → R2. Default
// expires in 10 minutes (600s) — the client should kick off the upload
// immediately after receiving this. Headers must be sent verbatim or R2
// rejects the request.
export async function presignUpload(args: {
  objectKey: string;
  contentType: string;
  contentLength?: number;
  expiresInSeconds?: number;
}): Promise<{
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
}> {
  const { s3, config } = client();
  const expiresIn = args.expiresInSeconds ?? 600;
  const cmd = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: args.objectKey,
    ContentType: args.contentType,
    ContentLength: args.contentLength,
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn });
  const headers: Record<string, string> = {
    'Content-Type': args.contentType,
  };
  if (args.contentLength !== undefined) {
    headers['Content-Length'] = String(args.contentLength);
  }
  return {
    url,
    headers,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

// Presigned GET URL for assets that aren't publicly served. Default 1
// hour expiry — long enough for a browser tab to load the asset, short
// enough that a leaked URL doesn't grant indefinite access.
export async function presignGet(args: {
  objectKey: string;
  expiresInSeconds?: number;
}): Promise<{ url: string; expiresAt: string }> {
  const { s3, config } = client();
  const expiresIn = args.expiresInSeconds ?? 3600;
  const cmd = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: args.objectKey,
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn });
  return {
    url,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

// HeadObject — returns metadata if the object exists, or null if 404. Used
// by /complete to verify the client actually uploaded what they said they
// would (size cross-check + etag capture).
export async function headObject(args: { objectKey: string }): Promise<
  | {
      exists: true;
      contentLength: number;
      contentType: string | null;
      etag: string | null;
    }
  | { exists: false }
> {
  const { s3, config } = client();
  try {
    const result = await s3.send(
      new HeadObjectCommand({
        Bucket: config.bucketName,
        Key: args.objectKey,
      }),
    );
    return {
      exists: true,
      contentLength: result.ContentLength ?? 0,
      contentType: result.ContentType ?? null,
      etag: result.ETag ?? null,
    };
  } catch (err) {
    // R2 returns 404 as NotFound. Other errors should surface (so we don't
    // silently treat "permissions broken" as "doesn't exist").
    if (
      err instanceof Error &&
      'name' in err &&
      (err.name === 'NotFound' || err.name === 'NoSuchKey')
    ) {
      return { exists: false };
    }
    throw err;
  }
}

// Helper for tests: compute a sha256 of a string buffer (used in
// /complete to validate caller-supplied checksum vs upload). Exported
// so the smoke script can reuse the same hash function.
export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}
