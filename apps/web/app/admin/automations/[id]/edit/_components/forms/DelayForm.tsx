'use client';

import { Input, Select } from '@/components/ui';

// Delay node form. The DelayNodeData shape has four kinds — the builder
// hides irrelevant fields based on the picked kind.

type DelayKind =
  | 'relative'
  | 'until_appointment'
  | 'until_date'
  | 'until_client_birthday';

interface FormData {
  kind?: DelayKind;
  delayMs?: number;
  appointmentOffsetMs?: number;
  untilDateIso?: string;
}

interface Props {
  data: FormData;
  onChange: (next: FormData) => void;
  disabled?: boolean;
}

// Duration unit conversions for the relative + appointment-offset inputs.
const UNIT_MS = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
} as const;

type Unit = 'minutes' | 'hours' | 'days';

function pickUnit(ms: number | undefined): { value: number; unit: Unit } {
  if (typeof ms !== 'number' || ms === 0) return { value: 0, unit: 'minutes' };
  const abs = Math.abs(ms);
  if (abs % UNIT_MS.days === 0) return { value: ms / UNIT_MS.days, unit: 'days' };
  if (abs % UNIT_MS.hours === 0) return { value: ms / UNIT_MS.hours, unit: 'hours' };
  return { value: ms / UNIT_MS.minutes, unit: 'minutes' };
}

export function DelayForm({ data, onChange, disabled }: Props) {
  const kind: DelayKind = data.kind ?? 'relative';

  return (
    <div className="flex flex-col gap-s4">
      <label className="flex flex-col gap-s2">
        <span className="t-caption text-ink-soft">Delay kind</span>
        <Select
          value={kind}
          onChange={(e) =>
            onChange({ ...data, kind: e.target.value as DelayKind })
          }
          disabled={disabled}
        >
          <option value="relative">Wait a fixed duration</option>
          <option value="until_appointment">Wait until appointment time</option>
          <option value="until_date">Wait until a specific date</option>
          <option value="until_client_birthday">Wait until client birthday</option>
        </Select>
      </label>

      {kind === 'relative' ? (
        <RelativeFields
          ms={data.delayMs}
          onChange={(ms) => onChange({ ...data, delayMs: ms })}
          disabled={disabled}
        />
      ) : null}

      {kind === 'until_appointment' ? (
        <OffsetFields
          ms={data.appointmentOffsetMs}
          onChange={(ms) =>
            onChange({ ...data, appointmentOffsetMs: ms })
          }
          disabled={disabled}
        />
      ) : null}

      {kind === 'until_date' ? (
        <label className="flex flex-col gap-s2">
          <span className="t-caption text-ink-soft">Wait until</span>
          <Input
            type="datetime-local"
            value={isoToInputValue(data.untilDateIso)}
            onChange={(e) =>
              onChange({ ...data, untilDateIso: inputValueToIso(e.target.value) })
            }
            disabled={disabled}
          />
        </label>
      ) : null}

      {kind === 'until_client_birthday' ? (
        <p className="t-caption text-ink-soft">
          Fires at the next occurrence of the client&apos;s birthday after the
          workflow reaches this step.
        </p>
      ) : null}
    </div>
  );
}

function RelativeFields({
  ms,
  onChange,
  disabled,
}: {
  ms: number | undefined;
  onChange: (ms: number) => void;
  disabled?: boolean;
}) {
  const { value, unit } = pickUnit(ms);
  const update = (n: number, u: Unit) =>
    onChange(Math.round(n * UNIT_MS[u]));
  return (
    <div className="grid grid-cols-[1fr_140px] gap-s2">
      <Input
        type="number"
        min={0}
        value={value === 0 ? '' : value}
        onChange={(e) => {
          const raw = e.target.value === '' ? 0 : Number(e.target.value);
          update(Number.isFinite(raw) ? raw : 0, unit);
        }}
        disabled={disabled}
        aria-label="Duration value"
        placeholder="e.g. 30"
      />
      <Select
        value={unit}
        onChange={(e) => update(value, e.target.value as Unit)}
        disabled={disabled}
        aria-label="Duration unit"
      >
        <option value="minutes">minutes</option>
        <option value="hours">hours</option>
        <option value="days">days</option>
      </Select>
    </div>
  );
}

function OffsetFields({
  ms,
  onChange,
  disabled,
}: {
  ms: number | undefined;
  onChange: (ms: number) => void;
  disabled?: boolean;
}) {
  const direction = (ms ?? 0) < 0 ? 'before' : 'after';
  const { value, unit } = pickUnit(Math.abs(ms ?? 0));
  const update = (n: number, u: Unit, dir: 'before' | 'after') => {
    const abs = Math.round(n * UNIT_MS[u]);
    onChange(dir === 'before' ? -abs : abs);
  };
  return (
    <div className="grid grid-cols-[1fr_140px_140px] gap-s2">
      <Input
        type="number"
        min={0}
        value={value === 0 ? '' : value}
        onChange={(e) => {
          const raw = e.target.value === '' ? 0 : Number(e.target.value);
          update(Number.isFinite(raw) ? raw : 0, unit, direction);
        }}
        disabled={disabled}
        aria-label="Offset value"
        placeholder="e.g. 24"
      />
      <Select
        value={unit}
        onChange={(e) =>
          update(value, e.target.value as Unit, direction)
        }
        disabled={disabled}
        aria-label="Offset unit"
      >
        <option value="minutes">minutes</option>
        <option value="hours">hours</option>
        <option value="days">days</option>
      </Select>
      <Select
        value={direction}
        onChange={(e) =>
          update(value, unit, e.target.value === 'before' ? 'before' : 'after')
        }
        disabled={disabled}
        aria-label="Offset direction"
      >
        <option value="before">before</option>
        <option value="after">after</option>
      </Select>
    </div>
  );
}

// HTML datetime-local inputs use a local-time, no-tz string ("2026-05-28T14:00").
// We round-trip through ISO so node.data stays UTC-safe. The picker shows the
// admin's local clock — adequate for PR 8; per-tenant timezone awareness can
// follow when the test-mode PR (PR 10) needs it.

function isoToInputValue(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function inputValueToIso(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
