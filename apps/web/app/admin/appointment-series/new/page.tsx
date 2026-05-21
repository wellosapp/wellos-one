import Link from 'next/link';

import { Alert, Card } from '@/components/ui';
import { ApiError } from '@/lib/api/client';
import { listServices, type Service } from '@/lib/api/services';
import { listStaff, type Staff } from '@/lib/api/staff';
import { getWhoami, type WhoamiLocation } from '@/lib/api/whoami';

import { CreateSeriesForm } from './CreateSeriesForm';

export default async function NewAppointmentSeriesPage() {
  let staff: Staff[] = [];
  let services: Service[] = [];
  let locations: WhoamiLocation[] = [];
  let loadError: string | null = null;

  try {
    const [staffRes, servicesRes, whoami] = await Promise.all([
      listStaff({ active: true, take: 200 }),
      listServices({ active: true, take: 200 }),
      getWhoami(),
    ]);
    staff = staffRes.staff;
    services = servicesRes.services;
    locations = whoami.locations;
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      loadError = 'You do not have admin access to this tenant.';
    } else if (err instanceof ApiError) {
      loadError = err.message;
    } else {
      throw err;
    }
  }

  return (
    <div className="flex flex-col gap-s6">
      <div>
        <Link
          href="/admin/appointment-series"
          className="t-body-sm text-accent no-underline hover:underline"
        >
          ← Back to series
        </Link>
      </div>
      <header className="flex flex-col gap-s1">
        <span className="t-eyebrow text-accent">Recurring series</span>
        <h1 className="t-display-lg">New series</h1>
        <p className="t-body-sm text-ink-soft">
          Build a recurring appointment template. Wellos generates every
          occurrence on the calendar at create time and checks each slot for
          conflicts before saving.
        </p>
      </header>

      {loadError ? (
        <Alert tone="error">{loadError}</Alert>
      ) : (
        <Card padding="lg">
          <CreateSeriesForm
            staff={staff.map((s) => ({
              id: s.id,
              firstName: s.firstName,
              lastName: s.lastName,
            }))}
            services={services.map((s) => ({
              id: s.id,
              name: s.name,
              durationMinutes: s.durationMinutes,
              basePriceCents: s.basePriceCents,
            }))}
            locations={locations.map((l) => ({ id: l.id, name: l.name }))}
          />
        </Card>
      )}
    </div>
  );
}
