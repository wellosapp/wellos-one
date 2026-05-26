// Small focused helpers for magic-link bearer tokens.
//
// Raw tokens are 32 random bytes hex-encoded (64 chars). We store only the
// SHA-256 digest of the raw token; verifyToken recomputes the digest from
// the inbound bearer header and looks the row up by unique index. The shape
// regex in parseBearerToken short-circuits malformed headers before they
// reach the DB.

import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32; // 64 hex chars after toString('hex')

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Parse an `Authorization: Bearer <token>` header. Returns null if the
 * header is missing, malformed, uses the wrong scheme, or carries a token
 * whose shape doesn't match our 64-lowercase-hex contract.
 *
 * The shape regex guarantees verifyToken never has to defend against
 * arbitrary user input before hashing — a malformed token short-circuits
 * here and produces a clean 401 at the middleware.
 */
export function parseBearerToken(
  authHeader: string | undefined | null,
): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+([a-f0-9]{64})$/.exec(authHeader);
  return match ? match[1]! : null;
}
