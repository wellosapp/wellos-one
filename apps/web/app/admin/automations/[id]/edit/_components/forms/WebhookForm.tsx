'use client';

import { useState } from 'react';

import { Input, Textarea } from '@/components/ui';
import { cn } from '@/lib/cn';

interface FormData {
  targetUrl?: string;
  headers?: Record<string, string>;
  payload?: Record<string, unknown>;
}

interface Props {
  data: FormData;
  onChange: (next: FormData) => void;
  disabled?: boolean;
}

// Webhook node form. URL + headers (as a key/value list) + payload (raw JSON
// editor — kept simple here; a per-field template builder can come later).

export function WebhookForm({ data, onChange, disabled }: Props) {
  const headers = data.headers ?? {};
  const headerEntries = Object.entries(headers);
  const [payloadText, setPayloadText] = useState<string>(() =>
    data.payload ? JSON.stringify(data.payload, null, 2) : '',
  );
  const [payloadError, setPayloadError] = useState<string | null>(null);

  const setHeader = (key: string, value: string, oldKey?: string) => {
    const next = { ...headers };
    if (oldKey && oldKey !== key) delete next[oldKey];
    if (key === '') {
      // Empty key removes the entry — keeps the editor from holding "" keys.
      if (oldKey) delete next[oldKey];
    } else {
      next[key] = value;
    }
    onChange({ ...data, headers: next });
  };

  const removeHeader = (key: string) => {
    const next = { ...headers };
    delete next[key];
    onChange({ ...data, headers: next });
  };

  const addHeader = () => {
    onChange({ ...data, headers: { ...headers, '': '' } });
  };

  const onPayloadBlur = () => {
    if (payloadText.trim() === '') {
      setPayloadError(null);
      onChange({ ...data, payload: undefined });
      return;
    }
    try {
      const parsed = JSON.parse(payloadText);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setPayloadError('Payload must be a JSON object.');
        return;
      }
      setPayloadError(null);
      onChange({ ...data, payload: parsed as Record<string, unknown> });
    } catch (err) {
      setPayloadError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  return (
    <div className="flex flex-col gap-s4">
      <label className="flex flex-col gap-s2">
        <span className="t-caption text-ink-soft">Target URL</span>
        <Input
          type="url"
          value={data.targetUrl ?? ''}
          onChange={(e) => onChange({ ...data, targetUrl: e.target.value })}
          placeholder="https://example.com/webhook"
          disabled={disabled}
        />
      </label>

      <div className="flex flex-col gap-s2">
        <div className="flex items-center justify-between">
          <span className="t-caption text-ink-soft">Headers</span>
          <button
            type="button"
            onClick={addHeader}
            disabled={disabled}
            className={cn(
              't-caption text-accent no-underline hover:underline',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            + Add header
          </button>
        </div>
        {headerEntries.length === 0 ? (
          <p className="t-caption text-ink-soft">No custom headers.</p>
        ) : (
          <ul className="flex flex-col gap-s2">
            {headerEntries.map(([key, value], index) => (
              <li key={`${key}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-s2">
                <Input
                  value={key}
                  onChange={(e) => setHeader(e.target.value, value, key)}
                  placeholder="Header name"
                  disabled={disabled}
                  aria-label="Header name"
                />
                <Input
                  value={value}
                  onChange={(e) => setHeader(key, e.target.value)}
                  placeholder="Value"
                  disabled={disabled}
                  aria-label="Header value"
                />
                <button
                  type="button"
                  onClick={() => removeHeader(key)}
                  disabled={disabled}
                  aria-label="Remove header"
                  className={cn(
                    't-body-sm text-ink-soft hover:text-red',
                    disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <label className="flex flex-col gap-s2">
        <span className="t-caption text-ink-soft">Payload (JSON)</span>
        <Textarea
          value={payloadText}
          onChange={(e) => setPayloadText(e.target.value)}
          onBlur={onPayloadBlur}
          rows={6}
          placeholder='{ "key": "value" }'
          disabled={disabled}
          className="font-mono text-[14px]"
        />
        {payloadError ? (
          <span className="t-caption text-red">{payloadError}</span>
        ) : (
          <span className="t-caption text-ink-soft">
            Optional — sent as the POST body.
          </span>
        )}
      </label>
    </div>
  );
}
