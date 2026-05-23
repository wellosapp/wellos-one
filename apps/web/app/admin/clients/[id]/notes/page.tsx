import type { Route } from 'next';
import Link from 'next/link';

import { FileTextIcon, PlusIcon } from '@/app/admin/_shell/icons';
import { ApiError } from '@/lib/api/client';
import {
  listClientNotes,
  type NoteCategory,
} from '@/lib/api/client-notes';
import { cn } from '@/lib/cn';

import { loadClientDetail } from '../_data';

import { CategoryFilterPills } from './CategoryFilterPills';
import { NotesComposer } from './NotesComposer';
import { NotesList } from './NotesList';
import { SearchBarComingSoon } from './SearchBarComingSoon';

// /admin/clients/:id/notes — server-rendered notes tab. Matches the
// visual fidelity established by the Overview / Visits / Book tabs.
// URL drives state: ?category=<value> filters; ?compose=1 mounts the composer.

const USER_FACING_CATEGORIES: ReadonlyArray<NoteCategory> = [
  'general',
  'preference',
  'formula',
  'allergy',
  'medical',
  'behavioral',
  'billing',
  'internal',
];

function parseCategory(raw: string | undefined): NoteCategory | null {
  if (!raw) return null;
  // Accept any of the 8 user-facing categories; ignore others to keep the
  // URL → state mapping unambiguous.
  return USER_FACING_CATEGORIES.includes(raw as NoteCategory)
    ? (raw as NoteCategory)
    : null;
}

export default async function ClientNotesTabPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ category?: string; compose?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const activeCategory = parseCategory(sp.category);
  const composeOpen = sp.compose === '1';

  const client = await loadClientDetail(id);

  let notes: Awaited<ReturnType<typeof listClientNotes>>['notes'] = [];
  let loadError: string | null = null;
  try {
    const res = await listClientNotes(id, {
      take: 200,
      category: activeCategory ?? undefined,
    });
    notes = res.notes;
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? err.message
        : 'Could not load notes. Is the API running?';
  }

  // Compose href: preserves ?category if set.
  function makeHref(opts: {
    category?: NoteCategory | null;
    compose?: boolean;
  }): Route {
    const params = new URLSearchParams();
    const cat = opts.category === undefined ? activeCategory : opts.category;
    if (cat) params.set('category', cat);
    if (opts.compose) params.set('compose', '1');
    const qs = params.toString();
    return (`/admin/clients/${id}/notes${qs ? `?${qs}` : ''}`) as Route;
  }

  const composeHref = makeHref({ compose: true });
  const closeHref = makeHref({ compose: false });

  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
      )}
    >
      <header
        className={cn(
          'border-b border-line bg-surface-sunk/40',
          'px-s6 py-s5 lg:px-s8 lg:py-s6',
        )}
      >
        <div className="flex items-start justify-between gap-s4">
          <div className="flex items-center gap-s2 t-eyebrow tracking-wide text-sage">
            <FileTextIcon size={14} />
            <span>NOTES</span>
          </div>
          <div className="flex items-center gap-s2">
            {composeOpen ? (
              <Link
                href={closeHref}
                className={cn(
                  'inline-flex items-center gap-s2 rounded-full border border-line bg-surface-2 px-s4 py-s2',
                  'text-[13px] font-medium text-ink-3 no-underline',
                  'transition-colors duration-fast hover:bg-sage-tint-2',
                )}
              >
                Close composer
              </Link>
            ) : (
              <Link
                href={composeHref}
                className={cn(
                  'inline-flex items-center gap-s2 rounded-full bg-accent px-s5 py-s2',
                  'text-[13px] font-semibold text-ink-inv no-underline',
                  'transition-colors duration-fast hover:bg-sage-deep',
                )}
              >
                <PlusIcon size={14} />
                New note
              </Link>
            )}
          </div>
        </div>
        <h2 className="mt-s2 font-display text-[22px] leading-tight text-ink">
          Notes about {client.firstName}.
        </h2>
        <p className="mt-s2 max-w-2xl t-body-md leading-relaxed text-ink-3">
          Operational context, preferences, and history. Visible to staff
          with access.
        </p>
      </header>

      <div className="flex flex-col gap-s4 p-s6 lg:p-s8">
        <CategoryFilterPills
          clientId={id}
          activeCategory={activeCategory}
          preserveCompose={composeOpen}
        />

        <SearchBarComingSoon />

        {composeOpen && (
          <NotesComposer clientId={id} closeHref={closeHref} />
        )}

        {loadError ? (
          <div
            className={cn(
              'rounded-md border border-red/30 bg-red-pale/40 p-s4',
              't-body-sm text-red',
            )}
          >
            {loadError}
          </div>
        ) : (
          <NotesList
            notes={notes}
            clientId={id}
            composeHref={composeHref}
          />
        )}

        <p className="t-caption text-ink-4">
          Visibility: admin-only. Clinical and provider-only filters coming
          soon.
        </p>
      </div>
    </section>
  );
}
