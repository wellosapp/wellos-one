import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

// Right-aligned footer with an auto-save status hint + Revert + Save
// buttons. Buttons target the parent form via the `form="<id>"` attribute
// so the footer can live OUTSIDE the form element without breaking
// submit/reset semantics (helpful when the section card chrome wraps the
// form).
//
// Auto-save isn't wired yet — copy ships as "Manual save below." until a
// debounced save handler lands. Once the auto-save effect is in place
// flip `autoSaveCopy` to "All changes auto-save".

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M4 12l5 5L20 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M3 12a9 9 0 0 1 15.5-6.2M21 4v5h-5M21 12a9 9 0 0 1-15.5 6.2M3 20v-5h5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SectionSaveFooter({
  formId,
  autoSaveCopy = 'Manual save below.',
}: {
  formId?: string;
  autoSaveCopy?: string;
  savePending?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-s3 border-t border-line/70 bg-surface-sunk/40',
        'px-s6 py-s4 lg:px-s8',
      )}
    >
      <span className="inline-flex items-center gap-s2 t-body-sm text-ink-3">
        <CheckIcon className="h-[14px] w-[14px] text-sage-deep" />
        {autoSaveCopy}
      </span>
      <span className="flex-1" />
      <Button
        type="reset"
        variant="ghost"
        size="sm"
        {...(formId ? { form: formId } : {})}
        icon={<RefreshIcon className="h-[14px] w-[14px]" />}
      >
        Revert
      </Button>
      <Button
        type="submit"
        variant="primary"
        size="sm"
        {...(formId ? { form: formId } : {})}
        icon={<CheckIcon className="h-[14px] w-[14px]" />}
      >
        Save changes
      </Button>
    </div>
  );
}
