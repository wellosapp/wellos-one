import { SearchIcon } from '@/app/admin/_shell/icons';
import { cn } from '@/lib/cn';

// Dimmed search bar placeholder. Visible row above the composer + list so the
// affordance reads as part of the surface today; the input is disabled until
// search lands with the Notes domain epic.

export function SearchBarComingSoon() {
  return (
    <div className="relative w-full">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-s4 top-1/2 -translate-y-1/2 text-ink-soft"
      >
        <SearchIcon size={16} />
      </span>
      <input
        type="text"
        disabled
        aria-disabled="true"
        placeholder="Search notes…"
        title="Coming soon — note search lands with the Notes domain epic"
        className={cn(
          'w-full bg-white text-ink font-sans text-[16px]',
          'border-[1.5px] border-surface-3 rounded-md',
          'pl-[48px] pr-s4 py-[13px]',
          'placeholder:text-placeholder',
          'opacity-60 cursor-not-allowed',
        )}
      />
    </div>
  );
}
