'use client';

import { Select } from '@/components/ui';
import { TRIGGER_EVENT_GROUPS } from '../../../../_components/triggerEventGroups';

import {
  ConditionGroupBuilder,
  type ConditionGroup,
} from './ConditionGroupBuilder';

// Trigger node form. Lets the user swap the trigger type and optionally
// attach a pre-filter ConditionGroup so the workflow only fires on events
// matching the rules. The pre-filter is evaluated by the dispatcher (PR 3
// of the epic).
//
// The shell propagates node.data.triggerType up to workflow.triggerType on
// save — keeping the AutomationWorkflow.triggerType column in sync with the
// trigger node in workflow_json.

interface TriggerData {
  triggerType?: string;
  filter?: ConditionGroup;
}

interface Props {
  data: TriggerData;
  onChange: (next: TriggerData) => void;
  disabled?: boolean;
}

const EMPTY_GROUP: ConditionGroup = { combinator: 'AND', rules: [] };

export function TriggerForm({ data, onChange, disabled }: Props) {
  const triggerType = data.triggerType ?? '';
  const filter = data.filter ?? null;

  return (
    <div className="flex flex-col gap-s4">
      <label className="flex flex-col gap-s2">
        <span className="t-caption text-ink-soft">Trigger event</span>
        <Select
          value={triggerType}
          onChange={(e) => onChange({ ...data, triggerType: e.target.value })}
          disabled={disabled}
        >
          {TRIGGER_EVENT_GROUPS.map((group) => (
            <optgroup
              key={group.label}
              label={group.label + (group.comingSoon ? ' (coming soon)' : '')}
            >
              {group.choices.map((c) => (
                <option key={c.value} value={c.value} disabled={c.disabled}>
                  {c.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </label>

      <div className="flex flex-col gap-s2">
        <div className="flex items-center justify-between">
          <span className="t-caption text-ink-soft">Pre-filter</span>
          {filter ? (
            <button
              type="button"
              onClick={() => onChange({ ...data, filter: undefined })}
              disabled={disabled}
              className="t-caption text-ink-soft no-underline hover:text-red"
            >
              Remove
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onChange({ ...data, filter: EMPTY_GROUP })}
              disabled={disabled}
              className="t-caption text-accent no-underline hover:underline"
            >
              + Add filter
            </button>
          )}
        </div>
        {filter ? (
          <ConditionGroupBuilder
            triggerType={triggerType}
            value={filter}
            onChange={(next) => onChange({ ...data, filter: next })}
            disabled={disabled}
          />
        ) : (
          <p className="t-caption text-ink-soft">
            Fire on every matching event. Add a filter to restrict.
          </p>
        )}
      </div>
    </div>
  );
}
