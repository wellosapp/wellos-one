import { timingSafeEqual } from 'node:crypto';

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Postmark dashboard HTTP Basic Auth for bounce / spam webhooks.
 * Verify the Authorization header before reading webhook JSON fields.
 */
export function verifyPostmarkWebhookBasicAuth(
  authorizationHeader: string | string[] | undefined,
): boolean {
  const user = process.env.POSTMARK_WEBHOOK_BASIC_USER;
  const pass = process.env.POSTMARK_WEBHOOK_SECRET;
  if (!user?.trim() || !pass) {
    return false;
  }

  const authorization = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;
  if (!authorization || typeof authorization !== 'string') {
    return false;
  }

  const match = /^Basic\s+(\S+)$/i.exec(authorization.trim());
  const b64 = match?.[1];
  if (!b64) {
    return false;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return false;
  }

  const colon = decoded.indexOf(':');
  if (colon === -1) {
    return false;
  }

  const basicUser = decoded.slice(0, colon);
  const basicPass = decoded.slice(colon + 1);

  return (
    timingSafeStringEqual(basicUser, user) &&
    timingSafeStringEqual(basicPass, pass)
  );
}

/**
 * TextLink sends the configured secret inside the JSON body (not an HMAC header).
 * Compare with timing-safe equality immediately after JSON parse.
 *
 * @see https://docs.textlinksms.com/webhooks
 */
export function verifyTextlinkWebhookBodySecret(body: unknown): boolean {
  const expected = process.env.TEXTLINK_WEBHOOK_SECRET;
  if (!expected) {
    return false;
  }

  if (!body || typeof body !== 'object') {
    return false;
  }

  const secret = (body as Record<string, unknown>).secret;
  if (typeof secret !== 'string') {
    return false;
  }

  return timingSafeStringEqual(secret, expected);
}
