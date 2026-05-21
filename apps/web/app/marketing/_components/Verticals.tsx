import type { ReactNode } from 'react';

import {
  FitnessIcon,
  MassageIcon,
  MedspaIcon,
  ScissorsIcon,
  TrainerIcon,
} from './icons';

interface Vertical {
  icon: ReactNode;
  label: string;
}

const VERTICALS: Vertical[] = [
  { icon: <ScissorsIcon className="text-accent" />, label: 'Salon' },
  { icon: <MassageIcon className="text-accent" />, label: 'Massage' },
  { icon: <MedspaIcon className="text-accent" />, label: 'Medspa' },
  { icon: <FitnessIcon className="text-accent" />, label: 'Fitness studio' },
  { icon: <TrainerIcon className="text-accent" />, label: 'Personal training' },
];

export function Verticals() {
  return (
    <section className="py-s12">
      <div className="mx-auto max-w-6xl px-s6">
        <div className="mb-s8 flex flex-col items-center gap-s2 text-center">
          <span className="t-eyebrow text-accent">Built for</span>
          <h2 className="t-display-lg text-ink md:text-[28px]">
            Five verticals. One platform that respects the differences.
          </h2>
        </div>
        <ul className="flex flex-wrap items-stretch justify-center gap-s3 md:gap-s4">
          {VERTICALS.map((v) => (
            <li
              key={v.label}
              className="flex min-w-[160px] flex-1 items-center gap-s3 rounded-lg border border-surface-3/70 bg-white px-s5 py-s4 transition-shadow duration-base hover:shadow-sm"
            >
              <span className="inline-flex h-s8 w-s8 items-center justify-center rounded-sm bg-accent-pale">
                {v.icon}
              </span>
              <span className="t-body-md font-medium text-ink">{v.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
