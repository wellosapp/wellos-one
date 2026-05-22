import { TrendUpIcon } from '@/app/admin/_shell/icons';
import { cn } from '@/lib/cn';

import { SectionHeader } from '../_components/SectionHeader';
import { ActivityComingSoon } from './ActivityComingSoon';

export default function ClientActivityTabPage() {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-md border border-line bg-surface shadow-sm',
      )}
    >
      <header className="border-b border-line/70 bg-surface-sunk/40 px-s6 py-s5 lg:px-s8 lg:py-s6">
        <SectionHeader
          icon={TrendUpIcon}
          eyebrow="ACTIVITY"
          headline="Audit trail."
          subtitle="Staff-visible activity — edits, bookings, payments, messages. Related visits remain on the Visits tab."
        />
      </header>
      <div className="p-s6 lg:p-s8">
        <ActivityComingSoon />
      </div>
    </section>
  );
}
