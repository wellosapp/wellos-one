'use client';

interface FormData {
  kind?: string;
}

interface Props {
  data: FormData;
}

const KIND_LABELS: Record<string, string> = {
  client_summary: 'Summarize client',
  provider_prep: 'Provider prep',
  soap_draft: 'Draft SOAP note',
  risk_identification: 'Identify risk',
};

// AI node form — read-only placeholder. The handler doesn't exist yet, so
// authoring config would just sit unused. A future AI epic ships real
// per-kind config (model selection, prompt overrides, output destinations).

export function AiForm({ data }: Props) {
  const kind = typeof data.kind === 'string' ? data.kind : '';
  const label = KIND_LABELS[kind] ?? 'AI step';

  return (
    <div className="flex flex-col gap-s2 rounded-md border border-dashed border-surface-3 bg-surface-2 p-s4">
      <span className="t-eyebrow text-ink-soft">AI • COMING SOON</span>
      <div className="t-body-md text-ink">{label}</div>
      <p className="t-caption text-ink-soft">
        AI handlers ship in a future epic. The node sits on the canvas as a
        placeholder — the engine writes a <code>skipped</code> node-run row
        when it encounters it.
      </p>
    </div>
  );
}
