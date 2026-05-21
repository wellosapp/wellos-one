/**
 * Tiny date/time formatters shared across the manage sub-views. The page is
 * anonymous so we lean on the visitor's locale + tz rather than a tenant
 * timezone (which the API doesn't return on this surface yet).
 */

export function formatFullWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRange(startIso: string, endIso: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  };
  return `${new Date(startIso).toLocaleTimeString(undefined, opts)} – ${new Date(
    endIso,
  ).toLocaleTimeString(undefined, opts)}`;
}

export function isPastCancellationDeadline(deadlineIso: string): boolean {
  return new Date(deadlineIso).getTime() <= Date.now();
}
