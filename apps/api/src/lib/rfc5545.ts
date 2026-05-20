/**
 * Minimal RFC 5545 helpers for iCalendar text output (staff read-only feed).
 */

/** Escape TEXT property values per RFC 5545 §3.3.11 */
export function icsEscapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** UTC floating instant as BASIC date-time with Z suffix */
export function icsFormatUtcBasic(dt: Date): string {
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  const h = String(dt.getUTCHours()).padStart(2, '0');
  const mi = String(dt.getUTCMinutes()).padStart(2, '0');
  const s = String(dt.getUTCSeconds()).padStart(2, '0');
  return `${y}${mo}${d}T${h}${mi}${s}Z`;
}

/**
 * Fold content lines to ~75 octets (ASCII-safe for our escaped TEXT usage).
 * RFC 5545 §3.1 — continuation begins with a single SPACE.
 */
export function icsFoldLines(rawLines: string[]): string[] {
  const max = 75;
  const out: string[] = [];
  for (const line of rawLines) {
    if (Buffer.byteLength(line, 'utf8') <= max) {
      out.push(line);
      continue;
    }
    let remaining = line;
    let first = true;
    while (remaining.length > 0) {
      let take = remaining.length;
      while (take > 0 && Buffer.byteLength(remaining.slice(0, take), 'utf8') > max) {
        take -= 1;
      }
      if (take === 0) {
        take = 1;
      }
      const chunk = remaining.slice(0, take);
      remaining = remaining.slice(take);
      out.push(first ? chunk : ` ${chunk}`);
      first = false;
    }
  }
  return out;
}
