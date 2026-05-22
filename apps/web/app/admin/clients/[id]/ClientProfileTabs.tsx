// Repurposed: the old top-tab strip has been replaced by the left section
// menu (see `_components/ClientProfileLeftMenu.tsx`). This file is kept for
// git history and to host the pure pathname → section-key helper used by
// other surfaces. The default rendering re-exports the new menu so any
// downstream import that names `ClientProfileTabs` keeps working.

export { ClientProfileLeftMenu as ClientProfileTabs } from './_components/ClientProfileLeftMenu';

/**
 * Maps a pathname under `/admin/clients/:id` to the active section key.
 * Kept here as a stable helper for code that needs to reason about the
 * active section without rendering the menu.
 */
export function profileTabKey(pathname: string, base: string): string {
  if (pathname.startsWith(`${base}/timeline`)) return 'visits';
  if (pathname.startsWith(`${base}/book`)) return 'book';
  if (pathname.startsWith(`${base}/notes`)) return 'notes';
  if (pathname.startsWith(`${base}/files`)) return 'files';
  if (pathname.startsWith(`${base}/intake`)) return 'intake';
  if (pathname.startsWith(`${base}/activity`)) return 'activity';
  if (pathname === base || pathname === `${base}/`) return 'overview';
  return 'overview';
}
