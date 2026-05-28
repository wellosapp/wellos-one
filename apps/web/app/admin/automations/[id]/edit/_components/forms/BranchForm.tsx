'use client';

import { Input } from '@/components/ui';
import { cn } from '@/lib/cn';

import {
  ConditionGroupBuilder,
  type ConditionGroup,
} from './ConditionGroupBuilder';

// Branch node form. A branch holds:
//   - an ordered list of { label, condition } — engine matches in order,
//     follows the outgoing edge where sourceHandle === branch.label.
//   - `hasDefault` — when true, an outgoing edge with sourceHandle === 'default'
//     is followed if no labeled branch matched.

interface Branch {
  label: string;
  condition: ConditionGroup;
}

interface FormData {
  branches?: Branch[];
  hasDefault?: boolean;
}

interface Props {
  data: FormData;
  onChange: (next: FormData) => void;
  triggerType: string;
  disabled?: boolean;
}

const EMPTY_GROUP: ConditionGroup = { combinator: 'AND', rules: [] };

export function BranchForm({ data, onChange, triggerType, disabled }: Props) {
  const branches = data.branches ?? [];
  const hasDefault = Boolean(data.hasDefault);

  const updateBranch = (index: number, next: Branch) => {
    onChange({
      ...data,
      branches: branches.map((b, i) => (i === index ? next : b)),
    });
  };

  const removeBranch = (index: number) => {
    onChange({
      ...data,
      branches: branches.filter((_, i) => i !== index),
    });
  };

  const addBranch = () => {
    onChange({
      ...data,
      branches: [
        ...branches,
        { label: nextBranchLabel(branches), condition: EMPTY_GROUP },
      ],
    });
  };

  return (
    <div className="flex flex-col gap-s4">
      <ul className="flex flex-col gap-s4">
        {branches.length === 0 ? (
          <li className="t-caption text-ink-soft">No branches yet.</li>
        ) : (
          branches.map((branch, index) => (
            <li
              key={index}
              className="rounded-md border border-surface-3 bg-surface-1 p-s3"
            >
              <div className="flex items-center gap-s2">
                <Input
                  value={branch.label}
                  onChange={(e) =>
                    updateBranch(index, { ...branch, label: e.target.value })
                  }
                  disabled={disabled}
                  placeholder="Branch label"
                  aria-label="Branch label"
                />
                <button
                  type="button"
                  onClick={() => removeBranch(index)}
                  disabled={disabled}
                  aria-label="Remove branch"
                  className={cn(
                    't-body-sm text-ink-soft hover:text-red',
                    disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  ✕
                </button>
              </div>
              <div className="mt-s3">
                <ConditionGroupBuilder
                  triggerType={triggerType}
                  value={branch.condition}
                  onChange={(next) =>
                    updateBranch(index, { ...branch, condition: next })
                  }
                  disabled={disabled}
                />
              </div>
            </li>
          ))
        )}
      </ul>

      <button
        type="button"
        onClick={addBranch}
        disabled={disabled}
        className={cn(
          't-body-sm text-accent no-underline hover:underline self-start',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        + Add branch
      </button>

      <label className="flex items-center gap-s2 t-body-sm text-ink">
        <input
          type="checkbox"
          checked={hasDefault}
          onChange={(e) => onChange({ ...data, hasDefault: e.target.checked })}
          disabled={disabled}
        />
        Follow a default edge when no branch matches
      </label>
    </div>
  );
}

function nextBranchLabel(branches: Branch[]): string {
  // Find a label of the form "branch-N" that isn't already taken.
  const taken = new Set(branches.map((b) => b.label));
  let i = branches.length + 1;
  while (taken.has(`branch-${i}`)) i += 1;
  return `branch-${i}`;
}
