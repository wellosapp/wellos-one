'use client';

// Visual color picker for the Service form. 8 brand presets + an optional
// custom hex via react-colorful in a popover. Carries its value through a
// hidden <input name={name}> so the parent <form> submission shape stays the
// same as the previous plain text input — the action layer continues to
// read `formData.get('color')` as a hex string.

import { useEffect, useRef, useState } from 'react';
import { HexColorPicker, HexColorInput } from 'react-colorful';

import { CheckIcon } from '@/app/admin/_shell/icons';
import { cn } from '@/lib/cn';

import {
  FALLBACK_BRAND_COLORS,
  findPresetName,
  type BrandColor,
} from './_constants/colors';

type Props = {
  /** Hidden input name — usually "color" so form submission shape stays the same. */
  name: string;
  /** Initial hex value. Empty string is fine; the picker just shows no selection. */
  defaultValue?: string;
  /** Whether to render with the error-state ring around the chip row. */
  error?: boolean;
  /** Brand-color presets. Defaults to FALLBACK_BRAND_COLORS — replace with
   *  loader output once Tenant.brandColors lands. */
  presets?: ReadonlyArray<BrandColor>;
};

// react-colorful's HexColorPicker is 200×200. Container width 224 = picker
// width (200) + padding-s2 on each side. Keep in sync if the picker resizes.
const POPOVER_WIDTH = 224;

// Fallback used to seed react-colorful's HSV state when no color is selected
// yet, so the saturation/value square renders something meaningful instead
// of all-zeros (black). Picked to match the Sage preset.
const PICKER_FALLBACK_COLOR = '#5D7C66';

function hexesEqual(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

export function ServiceColorPicker({
  name,
  defaultValue = '',
  error = false,
  presets = FALLBACK_BRAND_COLORS,
}: Props) {
  const [value, setValue] = useState<string>(defaultValue);
  const [popoverOpen, setPopoverOpen] = useState(false);
  // The value the picker had when the popover was opened, so Cancel can
  // restore it. react-colorful's onChange fires live during drag, so we
  // need this snapshot to implement Cancel semantics.
  const valueBeforeOpenRef = useRef<string>(defaultValue);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside-click + Esc. Same pattern as NoteRowKebab.
  useEffect(() => {
    if (!popoverOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Esc reverts to the pre-open value (Cancel semantics).
        setValue(valueBeforeOpenRef.current);
        setPopoverOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [popoverOpen]);

  function openPopover() {
    valueBeforeOpenRef.current = value;
    setPopoverOpen(true);
  }

  function cancelPopover() {
    setValue(valueBeforeOpenRef.current);
    setPopoverOpen(false);
  }

  function applyPopover() {
    setPopoverOpen(false);
  }

  function selectPreset(hex: string) {
    setValue(hex);
    setPopoverOpen(false);
  }

  const presetName = findPresetName(value, presets);
  const isCustomValue = value !== '' && presetName === null;

  return (
    <div ref={wrapRef} className="relative flex flex-col gap-s2">
      {/* Hidden input keeps the form-submission contract intact. readOnly
          silences React's controlled-input warning since we set value but
          have no onChange on this element (state moves via the chips and
          react-colorful). */}
      <input type="text" name={name} value={value} readOnly hidden />

      <div
        className={cn(
          'flex flex-wrap items-center gap-s2',
          error &&
            'rounded-md p-s2 ring-2 ring-red ring-offset-2 ring-offset-surface',
        )}
      >
        {presets.map((preset) => {
          const selected = hexesEqual(value, preset.hex);
          return (
            <button
              key={preset.hex}
              type="button"
              title={preset.name}
              aria-label={preset.name}
              aria-pressed={selected}
              onClick={() => selectPreset(preset.hex)}
              style={{ backgroundColor: preset.hex }}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-full',
                'transition-transform duration-fast hover:scale-110',
                'focus-visible:outline-none focus-visible:shadow-focus',
                selected &&
                  'ring-2 ring-sage-deep ring-offset-2 ring-offset-surface',
              )}
            >
              {selected ? (
                <CheckIcon size={16} className="text-ink-inv" />
              ) : null}
            </button>
          );
        })}

        {isCustomValue ? (
          <button
            type="button"
            title="Custom"
            aria-label="Custom"
            aria-pressed
            onClick={openPopover}
            style={{ backgroundColor: value }}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-full',
              'transition-transform duration-fast hover:scale-110',
              'focus-visible:outline-none focus-visible:shadow-focus',
              'ring-2 ring-sage-deep ring-offset-2 ring-offset-surface',
            )}
          >
            <CheckIcon size={16} className="text-ink-inv" />
          </button>
        ) : null}

        <button
          type="button"
          onClick={popoverOpen ? cancelPopover : openPopover}
          aria-expanded={popoverOpen}
          aria-haspopup="dialog"
          className={cn(
            'inline-flex items-center gap-s1 rounded-full border-2 border-line bg-surface px-s3 py-s1',
            'text-[12px] font-medium text-ink-2',
            'transition-colors duration-fast hover:border-sage hover:bg-sage-tint-2',
            'focus-visible:outline-none focus-visible:shadow-focus',
          )}
        >
          + Custom
        </button>
      </div>

      {popoverOpen ? (
        <div
          role="dialog"
          aria-label="Custom color picker"
          style={{ width: POPOVER_WIDTH }}
          className={cn(
            'absolute left-0 top-[calc(100%+8px)] z-20',
            'flex flex-col gap-s3 rounded-md border border-line bg-surface p-s4 shadow-md',
          )}
        >
          {/* react-colorful injects its own CSS via <style> tag at runtime,
              no separate import needed. */}
          <HexColorPicker
            color={value || PICKER_FALLBACK_COLOR}
            onChange={setValue}
          />

          <HexColorInput
            color={value || ''}
            onChange={setValue}
            prefixed
            className={cn(
              'h-9 w-full rounded-md border border-line bg-surface px-s2',
              't-body-sm text-ink',
              'focus-visible:outline-none focus-visible:shadow-focus',
            )}
          />

          <div className="flex items-center justify-end gap-s2">
            <button
              type="button"
              onClick={cancelPopover}
              className={cn(
                'rounded-sm border border-line bg-surface px-s2 py-s1',
                't-caption text-ink-3 hover:bg-sage-tint-2',
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyPopover}
              className={cn(
                'rounded-sm border border-sage-deep bg-sage-deep px-s2 py-s1',
                't-caption text-ink-inv hover:bg-sage',
              )}
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-s2 t-caption text-ink-3">
        {value ? (
          <span
            style={{ backgroundColor: value }}
            className="inline-block h-[12px] w-[12px] rounded-sm border border-line"
            aria-hidden="true"
          />
        ) : (
          <span
            className="inline-block h-[12px] w-[12px] rounded-sm border border-line bg-surface-2"
            aria-hidden="true"
          />
        )}
        <span>
          {value === '' && 'No color selected'}
          {value !== '' && presetName !== null && (
            <>
              Selected: {presetName} ({value.toUpperCase()})
            </>
          )}
          {value !== '' && presetName === null && (
            <>
              Selected: Custom ({value.toUpperCase()})
            </>
          )}
        </span>
      </div>
    </div>
  );
}
