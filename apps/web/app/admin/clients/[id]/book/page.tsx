import { loadClientDetail, loadQuickBookCatalog } from '../_data';
import { BookTabClient } from './BookTabClient';

export default async function ClientBookTabPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await loadClientDetail(id);
  const { directory, directoryError } = await loadQuickBookCatalog();

  const summary = {
    id: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    banned: client.banned,
    deletedAt: client.deletedAt,
    tags: client.tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
    })),
  };

  return (
    <BookTabClient
      summary={summary}
      directory={directory}
      directoryError={directoryError}
    />
  );
}
