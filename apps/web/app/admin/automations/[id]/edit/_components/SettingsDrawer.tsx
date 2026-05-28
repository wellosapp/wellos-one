'use client';

import { cn } from '@/lib/cn';

import type { FlowNode } from './WorkflowCanvas';
import { ActionForm } from './forms/ActionForm';
import { AiForm } from './forms/AiForm';
import { BranchForm } from './forms/BranchForm';
import { ConditionForm } from './forms/ConditionForm';
import { DelayForm } from './forms/DelayForm';
import { TriggerForm } from './forms/TriggerForm';
import { WebhookForm } from './forms/WebhookForm';

// Right-rail settings drawer. PR 8 of the Automation System epic.
//
// Docked panel (not modal). Hidden when no node is selected. The shell
// owns selection state + node.data mutations — this component is just the
// presentation + per-type form routing layer.

interface Props {
  node: FlowNode | null;
  /** Workflow-level triggerType — used by field/variable pickers. */
  triggerType: string;
  onChange: (data: Record<string, unknown>) => void;
  onClose: () => void;
  readOnly?: boolean;
}

function nodeTypeLabel(type: string): string {
  switch (type) {
    case 'trigger': return 'Trigger';
    case 'action': return 'Action';
    case 'condition': return 'Condition';
    case 'branch': return 'Branch';
    case 'filter': return 'Filter';
    case 'delay': return 'Delay';
    case 'webhook': return 'Webhook';
    case 'ai': return 'AI step';
    default: return type;
  }
}

export function SettingsDrawer({
  node,
  triggerType,
  onChange,
  onClose,
  readOnly,
}: Props) {
  if (!node) return null;

  return (
    <aside
      aria-label={`${nodeTypeLabel(node.type)} settings`}
      className="flex w-[400px] shrink-0 flex-col overflow-hidden border-l border-surface-3 bg-white"
    >
      <header className="flex items-start justify-between gap-s3 border-b border-surface-3 px-s5 py-s3">
        <div className="min-w-0">
          <div className="t-eyebrow text-ink-soft">{nodeTypeLabel(node.type)}</div>
          <h2 className="mt-s1 t-heading-sm text-ink">Step settings</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className={cn(
            'shrink-0 rounded-sm px-s2 py-s1 t-body-sm text-ink-soft',
            'hover:bg-surface-1 hover:text-ink',
          )}
        >
          ✕
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-s5 py-s4">
        <NodeFormFor
          node={node}
          triggerType={triggerType}
          onChange={onChange}
          readOnly={readOnly}
        />
      </div>
    </aside>
  );
}

function NodeFormFor({
  node,
  triggerType,
  onChange,
  readOnly,
}: {
  node: FlowNode;
  triggerType: string;
  onChange: (data: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  const data = node.data;
  // Each form has a narrower FormData type for editor ergonomics. The
  // shell-level handler is generic — we widen at the call site so the
  // forms keep their typed API.
  const emit = (next: object) => onChange(next as Record<string, unknown>);

  switch (node.type) {
    case 'trigger':
      return <TriggerForm data={data} onChange={emit} disabled={readOnly} />;
    case 'action':
      return (
        <ActionForm
          data={data}
          onChange={emit}
          triggerType={triggerType}
          disabled={readOnly}
        />
      );
    case 'condition':
    case 'filter':
      return (
        <ConditionForm
          data={data}
          onChange={emit}
          triggerType={triggerType}
          disabled={readOnly}
        />
      );
    case 'branch':
      return (
        <BranchForm
          data={data}
          onChange={emit}
          triggerType={triggerType}
          disabled={readOnly}
        />
      );
    case 'delay':
      return <DelayForm data={data} onChange={emit} disabled={readOnly} />;
    case 'webhook':
      return <WebhookForm data={data} onChange={emit} disabled={readOnly} />;
    case 'ai':
      return <AiForm data={data} />;
    default:
      return (
        <p className="t-caption text-ink-soft">
          No settings for this step type.
        </p>
      );
  }
}
