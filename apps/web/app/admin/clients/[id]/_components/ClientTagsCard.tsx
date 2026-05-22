'use client';

import { useState, useTransition } from 'react';

import { cn } from '@/lib/cn';

import { PlusIcon, TagIcon, XIcon } from '@/app/admin/_shell/icons';

import type { ClientWriteBody } from '@/lib/api/clients';

import { updateClientAction, type ActionState } from '../../_actions';

import { SectionHeader } from './SectionHeader';

// Editable Tags card on the Overview. Replaces the checkbox fieldset
// previously rendered inside ClientForm. Optimistic UI: applies the change
// locally first, then fires updateClientAction in the background; on
// failure leaves the optimistic state in place per the plan (rollback toast
// is a follow-up).
//
// Because `updateClientAction` PATCHes ALL of ClientWriteBody (firstName is
// required), we re-send the current client snapshot alongside the new tag
// list. The action's Zod schema treats every non-tag field as optional and
// passes them through unchanged.

type TagOption = {
  id: string;
  name: string;
  color: string | null;
};

export function ClientTagsCard({
  clientId,
  currentTags,
  allTags,
  clientSnapshot,
}: {
  clientId: string;
  currentTags: TagOption[];
  allTags: TagOption[];
  /** Full snapshot of the client's writeable fields. Re-sent on every tag
   *  mutation so the PATCH validates and other columns stay put. */
  clientSnapshot: Partial<ClientWriteBody>;
}) {
  const [tags, setTags] = useState<TagOption[]>(currentTags);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [, startTransition] = useTransition();

  const availableTags = allTags.filter(
    (t) => !tags.some((current) => current.id === t.id),
  );

  function buildFormData(nextTagIds: string[]): FormData {
    const fd = new FormData();
    // Replay the snapshot so the PATCH carries every other field unchanged.
    const append = (key: string, value: string | undefined) => {
      if (value !== undefined && value !== null && value !== '') fd.append(key, value);
    };
    append('firstName', clientSnapshot.firstName);
    append('lastName', clientSnapshot.lastName);
    append('preferredName', clientSnapshot.preferredName);
    append('email', clientSnapshot.email);
    append('phone', clientSnapshot.phone);
    append('dateOfBirth', clientSnapshot.dateOfBirth);
    append('addressLine1', clientSnapshot.addressLine1);
    append('addressLine2', clientSnapshot.addressLine2);
    append('city', clientSnapshot.city);
    append('state', clientSnapshot.state);
    append('postalCode', clientSnapshot.postalCode);
    append('country', clientSnapshot.country);
    append('emergencyContactName', clientSnapshot.emergencyContactName);
    append('emergencyContactPhone', clientSnapshot.emergencyContactPhone);
    append('intakeStatus', clientSnapshot.intakeStatus);
    append('notes', clientSnapshot.notes);
    for (const id of nextTagIds) fd.append('tagIds', id);
    return fd;
  }

  async function persist(nextTagIds: string[]) {
    const fd = buildFormData(nextTagIds);
    const empty: ActionState = { ok: false };
    // Server action — direct call from a client component is supported.
    await updateClientAction(clientId, empty, fd);
  }

  function addTag(tag: TagOption) {
    const next = [...tags, tag];
    setTags(next);
    setDropdownOpen(false);
    startTransition(() => {
      void persist(next.map((t) => t.id));
    });
  }

  function removeTag(tagId: string) {
    const next = tags.filter((t) => t.id !== tagId);
    setTags(next);
    startTransition(() => {
      void persist(next.map((t) => t.id));
    });
  }

  return (
    <SectionHeader
      icon={TagIcon}
      eyebrow="TAGS"
      headline="Internal labels."
      subtitle="Tags help with segmentation, mailers, and reporting. Not visible to the client."
    >
      <div className="flex flex-wrap items-center gap-s2">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className={cn(
              'group inline-flex items-center gap-s2 rounded-sm border border-line bg-surface',
              'px-s3 py-s1 text-[13px] font-medium text-ink-2',
            )}
            style={{
              borderLeftColor: tag.color ?? 'var(--line-strong)',
              borderLeftWidth: '3px',
            }}
          >
            <span>{tag.name}</span>
            <button
              type="button"
              onClick={() => removeTag(tag.id)}
              className={cn(
                'ml-s1 hidden h-4 w-4 items-center justify-center rounded-sm',
                'text-ink-3 hover:bg-surface-2 hover:text-terracotta',
                'group-hover:inline-flex',
              )}
              aria-label={`Remove ${tag.name} tag`}
            >
              <XIcon size={12} />
            </button>
          </span>
        ))}

        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen((v) => !v)}
            disabled={availableTags.length === 0}
            className={cn(
              'inline-flex items-center gap-s2 rounded-sm border border-dashed border-line bg-surface',
              'px-s3 py-s1 text-[13px] font-medium text-ink-4',
              availableTags.length === 0
                ? 'cursor-not-allowed opacity-50'
                : 'cursor-pointer hover:border-sage hover:text-ink-2',
            )}
            aria-haspopup="menu"
            aria-expanded={dropdownOpen}
          >
            <PlusIcon size={14} />
            <span>Add tag</span>
          </button>
          {dropdownOpen && availableTags.length > 0 && (
            <div
              role="menu"
              className={cn(
                'absolute left-0 top-full z-10 mt-s2 flex max-h-64 min-w-[200px] flex-col gap-s1',
                'overflow-y-auto rounded-md border border-line bg-surface p-s2 shadow-md',
              )}
            >
              {availableTags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  role="menuitem"
                  onClick={() => addTag(tag)}
                  className={cn(
                    'inline-flex items-center gap-s2 rounded-sm px-s2 py-s1 text-left',
                    'text-[13px] text-ink hover:bg-surface-2',
                  )}
                >
                  {tag.color && (
                    <span
                      aria-hidden
                      className="inline-block h-[10px] w-[10px] shrink-0 rounded-sm border border-line"
                      style={{ backgroundColor: tag.color }}
                    />
                  )}
                  <span>{tag.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </SectionHeader>
  );
}
