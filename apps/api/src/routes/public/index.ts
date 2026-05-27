import type { FastifyInstance } from 'fastify';

import publicBookingRoutes from './booking.js';
import publicCalendarFeedRoutes from './calendar-feed.js';
import publicClassBookingRoutes from './class-booking.js';
import publicFormsRoutes from './forms.js';
import publicGeofenceCheckInRoutes from './geofence-check-in.js';
import publicSlotHoldRoutes from './slot-holds.js';
import publicWaitlistRoutes from './waitlist.js';

/** Login-free surfaces — booking (Epic 4) and staff calendar feed (Epic 7). */
export default async function publicRoutes(app: FastifyInstance): Promise<void> {
  await app.register(publicBookingRoutes);
  await app.register(publicClassBookingRoutes);
  await app.register(publicSlotHoldRoutes);
  await app.register(publicWaitlistRoutes);
  await app.register(publicCalendarFeedRoutes);
  await app.register(publicGeofenceCheckInRoutes);
  await app.register(publicFormsRoutes);
}
