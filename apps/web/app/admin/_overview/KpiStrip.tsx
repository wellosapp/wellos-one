// KpiStrip — server-component shell that lays out four KpiCards as a
// responsive grid. Page wires the cards as children.

import type { ReactNode } from 'react';

type KpiStripProps = {
  children: ReactNode;
};

export function KpiStrip({ children }: KpiStripProps) {
  return (
    <section className="grid grid-cols-2 gap-s4 lg:grid-cols-4">
      {children}
    </section>
  );
}
