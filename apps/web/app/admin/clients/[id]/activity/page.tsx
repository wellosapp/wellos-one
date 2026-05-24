import { loadClientDetail } from '../_data';

import { ActivityComingSoon } from './ActivityComingSoon';

export default async function ClientActivityTabPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await loadClientDetail(id);
  return <ActivityComingSoon firstName={client.firstName} />;
}
