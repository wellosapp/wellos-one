import type { FastifyInstance } from 'fastify';

import appointmentSeriesRoutes from './appointment-series.js';
import appointmentsRoutes from './appointments.js';
import availabilityRoutes from './availability.js';
import bookingSettingsRoutes from './booking-settings.js';
import clientNotesRoutes from './client-notes.js';
import clientTagsRoutes from './client-tags.js';
import clientsRoutes from './clients.js';
import contentDeliveriesRoutes from './content-deliveries.js';
import impersonateRoutes from './impersonate.js';
import intakeFormsRoutes from './intake-forms.js';
import linkedRecordsRoutes from './linked-records.js';
import mediaRoutes from './media.js';
import onboardingRoutes from './onboarding.js';
import serviceCategoriesRoutes from './service-categories.js';
import servicesRoutes from './services.js';
import soapNotesRoutes from './soap-notes.js';
import staffBookingPreferencesRoutes from './staff-booking-preferences.js';
import staffBookingRoutes from './staff-booking.js';
import staffCalendarSyncRoutes from './staff-calendar-sync.js';
import staffScheduleBlocksRoutes from './staff-schedule-blocks.js';
import staffRoutes from './staff.js';
import triageRoutes from './triage.js';
import waitlistRoutes from './waitlist.js';
import whoamiRoutes from './whoami.js';

// Admin-only API surface. All routes registered under /admin/* and behind
// requireRole.admin (or stricter). Adding a new admin endpoint = drop a route
// file in this folder and register it here.
export default async function adminRoutes(app: FastifyInstance): Promise<void> {
  await app.register(whoamiRoutes, { prefix: '/admin' });
  await app.register(clientsRoutes, { prefix: '/admin' });
  await app.register(clientTagsRoutes, { prefix: '/admin' });
  await app.register(clientNotesRoutes, { prefix: '/admin' });
  await app.register(servicesRoutes, { prefix: '/admin' });
  await app.register(serviceCategoriesRoutes, { prefix: '/admin' });
  await app.register(staffRoutes, { prefix: '/admin' });
  await app.register(staffBookingPreferencesRoutes, { prefix: '/admin' });
  await app.register(staffCalendarSyncRoutes, { prefix: '/admin' });
  await app.register(bookingSettingsRoutes, { prefix: '/admin' });
  await app.register(appointmentsRoutes, { prefix: '/admin' });
  await app.register(appointmentSeriesRoutes, { prefix: '/admin' });
  await app.register(availabilityRoutes, { prefix: '/admin' });
  await app.register(linkedRecordsRoutes, { prefix: '/admin' });
  await app.register(staffBookingRoutes, { prefix: '/admin' });
  await app.register(staffScheduleBlocksRoutes, { prefix: '/admin' });
  await app.register(triageRoutes, { prefix: '/admin' });
  await app.register(contentDeliveriesRoutes, { prefix: '/admin' });
  await app.register(soapNotesRoutes, { prefix: '/admin' });
  await app.register(mediaRoutes, { prefix: '/admin' });
  await app.register(onboardingRoutes, { prefix: '/admin' });
  await app.register(intakeFormsRoutes, { prefix: '/admin' });
  await app.register(waitlistRoutes, { prefix: '/admin' });
  await app.register(impersonateRoutes, { prefix: '/admin' });
}
