import { parseDateParam, toDateParam } from '@/lib/calendar';
import { parseViewParam } from '@/lib/calendar-view';

import { BookPageBody } from './BookPageBody';

type SearchParams = {
  date?: string;
  view?: string;
};

export default async function ClientBookPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const date = parseDateParam(sp.date);
  const dateParam = toDateParam(date);
  const view = parseViewParam(sp.view);

  return <BookPageBody date={date} dateParam={dateParam} view={view} />;
}
