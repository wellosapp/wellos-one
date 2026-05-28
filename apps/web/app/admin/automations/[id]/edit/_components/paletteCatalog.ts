// Palette catalog — the drag sources rendered in the left sidebar of the
// workflow canvas. PR 7 of the Automation System epic.
//
// Each item describes a node type that can be dropped onto the canvas:
//   - Built-in node types (condition, branch, filter, delay, webhook) map
//     directly to `WorkflowNodeType` in the engine.
//   - Action nodes share `nodeType: 'action'`. The catalog item carries the
//     `actionType` string that the action registry (see
//     `apps/api/src/lib/automationActionRegistry.ts`) will dispatch on. PR 7
//     places these on the canvas; PRs 14-16 register the real handlers.
//   - AI items are forward-compat placeholders. Disabled in PR 7 — a future
//     AI epic registers the handlers.
//
// Keep this catalog in sync with:
//   - apps/api/src/lib/automationWorkflowTypes.ts (the node-type union)
//   - The eventual action registrations in PRs 14-16

import type { ComponentType } from 'react';

import {
  BellIcon,
  CheckCircleIcon,
  ClipboardIcon,
  CloudIcon,
  FileTextIcon,
  FilterIcon,
  HourglassIcon,
  MessageIcon,
  MoreIcon,
  SparkIcon,
  TagIcon,
  UserIcon,
  WarnIcon,
} from '@/app/admin/_shell/icons';

// Mirrors WorkflowNodeType in the engine. Repeated here to keep the web
// workspace from depending on apps/api source — same pattern as
// AutomationWorkflowStatus in lib/api/automation-workflows.ts.
export type PaletteNodeType =
  | 'action'
  | 'condition'
  | 'branch'
  | 'filter'
  | 'delay'
  | 'webhook'
  | 'ai';

type IconComponent = ComponentType<{ size?: number; className?: string }>;

export interface PaletteItem {
  /** Stable key — used for React keys + drag dataTransfer payload. */
  id: string;
  label: string;
  description: string;
  icon: IconComponent;
  /** Becomes the `node.type` field on the dropped node. */
  nodeType: PaletteNodeType;
  /**
   * Becomes the `node.data` field on the dropped node. The shape varies by
   * nodeType — see the per-type interfaces in
   * apps/api/src/lib/automationWorkflowTypes.ts. Per-handler config gets
   * filled in by the settings drawer (PR 8); the defaults here are just
   * enough for the engine to recognize the node.
   */
  defaultData: Record<string, unknown>;
  /**
   * When true, the item renders as un-draggable with a "Coming soon" hint.
   * Used for AI placeholders (no handler exists yet) and any future
   * payment/membership actions that wait on Epic 6.
   */
  disabled?: boolean;
  /** Short suffix shown next to the label when disabled. */
  disabledReason?: string;
}

export interface PaletteGroup {
  label: string;
  items: PaletteItem[];
}

// ----- Helper builders -----

function flowItem(
  id: string,
  nodeType: Exclude<PaletteNodeType, 'action' | 'ai'>,
  label: string,
  description: string,
  icon: IconComponent,
  defaultData: Record<string, unknown> = {},
): PaletteItem {
  return { id, label, description, icon, nodeType, defaultData };
}

function actionItem(
  actionType: string,
  label: string,
  description: string,
  icon: IconComponent,
): PaletteItem {
  return {
    id: `action.${actionType}`,
    label,
    description,
    icon,
    nodeType: 'action',
    defaultData: { actionType, config: {} },
  };
}

function aiItem(
  kind: 'client_summary' | 'provider_prep' | 'soap_draft' | 'risk_identification',
  label: string,
  description: string,
): PaletteItem {
  return {
    id: `ai.${kind}`,
    label,
    description,
    icon: SparkIcon,
    nodeType: 'ai',
    defaultData: { kind },
    disabled: true,
    disabledReason: 'Coming soon',
  };
}

// ----- The catalog -----

export const PALETTE_GROUPS: PaletteGroup[] = [
  {
    label: 'Logic & flow',
    items: [
      flowItem(
        'flow.condition',
        'condition',
        'Condition',
        'Branch on true / false based on a rule',
        FilterIcon,
        {
          condition: { combinator: 'AND', rules: [] },
        },
      ),
      flowItem(
        'flow.branch',
        'branch',
        'Branch',
        'Pick one of several labeled paths',
        MoreIcon,
        {
          branches: [],
          hasDefault: false,
        },
      ),
      flowItem(
        'flow.filter',
        'filter',
        'Filter',
        'Stop the run unless the rule passes',
        FilterIcon,
        {
          condition: { combinator: 'AND', rules: [] },
        },
      ),
      flowItem(
        'flow.delay',
        'delay',
        'Delay',
        'Wait before continuing',
        HourglassIcon,
        {
          kind: 'relative',
          delayMs: 60_000,
        },
      ),
      flowItem(
        'flow.webhook',
        'webhook',
        'Webhook',
        'POST to an external URL',
        CloudIcon,
        {
          targetUrl: '',
        },
      ),
    ],
  },
  {
    label: 'Notifications & tasks',
    items: [
      actionItem(
        'internal_notification',
        'Internal notification',
        'Notify a staff member in the admin inbox',
        BellIcon,
      ),
      actionItem(
        'create_task',
        'Create task',
        'Assign a follow-up task to a staff member',
        CheckCircleIcon,
      ),
    ],
  },
  {
    label: 'CRM',
    items: [
      actionItem(
        'add_tag',
        'Add tag',
        'Apply a tag to the client',
        TagIcon,
      ),
      actionItem(
        'remove_tag',
        'Remove tag',
        'Remove a tag from the client',
        TagIcon,
      ),
      actionItem(
        'create_note',
        'Create client note',
        'Append a note to the client record',
        FileTextIcon,
      ),
      actionItem(
        'create_alert',
        'Create alert',
        'Add an alert flag to the client',
        WarnIcon,
      ),
      actionItem(
        'update_client_field',
        'Update client field',
        'Set or change a field on the client record',
        UserIcon,
      ),
    ],
  },
  {
    label: 'Forms',
    items: [
      actionItem(
        'assign_form',
        'Assign form',
        'Attach a form to the client without sending',
        ClipboardIcon,
      ),
      actionItem(
        'send_form',
        'Send form',
        'Send a form via the existing form-send service',
        ClipboardIcon,
      ),
    ],
  },
  {
    label: 'Messaging',
    items: [
      actionItem(
        'send_sms',
        'Send SMS',
        'Send a text via TextLink (stub until Epic 8 wires it)',
        MessageIcon,
      ),
      actionItem(
        'send_email',
        'Send email',
        'Send an email via Postmark (stub until Epic 8 wires it)',
        MessageIcon,
      ),
    ],
  },
  {
    label: 'AI',
    items: [
      aiItem(
        'client_summary',
        'Summarize client',
        'Generate a short client summary',
      ),
      aiItem(
        'provider_prep',
        'Provider prep',
        'Draft pre-appointment prep notes',
      ),
      aiItem(
        'soap_draft',
        'Draft SOAP note',
        'Draft a SOAP note skeleton',
      ),
      aiItem(
        'risk_identification',
        'Identify risk',
        'Surface risk flags from intake answers',
      ),
    ],
  },
];

/** Drag-event dataTransfer mime type for palette items. */
export const PALETTE_DRAG_MIME = 'application/x-wellos-palette-item';

/**
 * Find a palette item by id. Used by the canvas drop handler to look up the
 * defaults for the dropped node.
 */
export function findPaletteItem(id: string): PaletteItem | null {
  for (const group of PALETTE_GROUPS) {
    for (const item of group.items) {
      if (item.id === id) return item;
    }
  }
  return null;
}
