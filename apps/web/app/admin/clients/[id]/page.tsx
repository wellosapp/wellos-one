import { notFound } from 'next/navigation';

import { Alert } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { listClientNotes } from '@/lib/api/client-notes';
import { listClientTags } from '@/lib/api/client-tags';
import {
  getClient,
  getClientMedia,
  getClientStats,
} from '@/lib/api/clients';
import { getClientTimeline } from '@/lib/api/timeline';

import { ClientProfile } from './ClientProfile';

// /admin/clients/[id] — tenant-wide client profile (E3-S7).
// Doctor's-office model: one screen for everything about a client —
// profile, recent visits, all notes, all files, intake answers.
//
// Server-rendered: parses ?tab + ?edit from the URL and fires all the
// drilldown queries in parallel. Drilldown data flows down to a
// client-component shell (ClientProfile) that renders the header card,
// tab nav, and tab body.

const RECENT_VISITS_TAKE = 10;

type SearchParams = {
  tab?: string;
  edit?: string;
  // ?selected=<appointmentId> opens the inline VisitQuickViewDrawer for
  // the matching visit. Doctor's-office model — handle the visit
  // drilldown without leaving the profile.
  selected?: string;
};

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  // Fetch the client first so a 404 short-circuits the rest of the
  // parallel work. listClientTags is cheap so we run it in parallel.
  let client;
  let tags;
  try {
    const [clientResp, tagsResp] = await Promise.all([
      getClient(id),
      listClientTags({ take: 200 }),
    ]);
    client = clientResp.client;
    tags = tagsResp.tags;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  // Pull everything else in parallel — the page is doctor's-office
  // dense, so all drilldown panels load at once.
  let stats: Awaited<ReturnType<typeof getClientStats>> | null = null;
  let media: Awaited<ReturnType<typeof getClientMedia>> | null = null;
  let timeline: Awaited<ReturnType<typeof getClientTimeline>> | null = null;
  let allNotes: Awaited<ReturnType<typeof listClientNotes>> | null = null;
  let drilldownError: string | null = null;

  try {
    [stats, media, timeline, allNotes] = await Promise.all([
      getClientStats(id),
      getClientMedia(id),
      getClientTimeline(id, { take: RECENT_VISITS_TAKE }),
      listClientNotes(id, { take: 200 }),
    ]);
  } catch (err) {
    if (err instanceof ApiError) {
      drilldownError = err.message;
    } else {
      throw err;
    }
  }

  if (drilldownError || !stats || !media || !timeline || !allNotes) {
    return (
      <div className="flex flex-col gap-s4">
        <Alert tone="error">
          {drilldownError ?? 'Failed to load client profile.'}
        </Alert>
      </div>
    );
  }

  // If ?selected=<appointmentId>, find the matching visit so the
  // ClientProfile shell can render the inline VisitQuickViewDrawer.
  // No extra fetch — timeline.visits already carries everything the
  // drawer needs.
  const selectedVisit =
    sp.selected
      ? (timeline.visits.find((v) => v.appointment.id === sp.selected) ??
        null)
      : null;

  return (
    <ClientProfile
      client={client}
      tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
      stats={stats}
      media={media}
      timeline={timeline}
      allNotes={allNotes.notes}
      activeTab={sp.tab ?? 'overview'}
      editOpen={sp.edit === '1'}
      selectedVisit={selectedVisit}
    />
  );
}
