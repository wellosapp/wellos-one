'use client';

import {
  ConditionGroupBuilder,
  type ConditionGroup,
} from './ConditionGroupBuilder';

// Condition / filter node form. Both share the same shape — a single
// ConditionGroup keyed as `condition` on node.data. The engine's behavior
// difference (condition splits into true/false branches; filter terminates
// the run on false) is at execution time, not in the data.

interface FormData {
  condition?: ConditionGroup;
}

interface Props {
  data: FormData;
  onChange: (next: FormData) => void;
  triggerType: string;
  disabled?: boolean;
}

const EMPTY_GROUP: ConditionGroup = { combinator: 'AND', rules: [] };

export function ConditionForm({ data, onChange, triggerType, disabled }: Props) {
  const condition = data.condition ?? EMPTY_GROUP;
  return (
    <ConditionGroupBuilder
      triggerType={triggerType}
      value={condition}
      onChange={(next) => onChange({ ...data, condition: next })}
      disabled={disabled}
    />
  );
}
