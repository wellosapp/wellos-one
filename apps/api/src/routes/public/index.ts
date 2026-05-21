import type { FastifyInstance } from 'fastify';

import publicBookingRoutes from './booking.js';
import publicBookingConfirmationRoutes from './booking-confirmation.js';
import publicCalendarFeedRoutes from './calendar-feed.js';
import publicDisputeMatchRoutes from './dispute-match.js';
import publicSlotHoldRoutes from './slot-holds.js';
import publicWaitlistRoutes from './waitlist.js';

/** Login-free surfaces — booking (Epic 4) and staff calendar feed (Epic 7). */
export default async function publicRoutes(app: FastifyInstance): Promise<void> {
  await app.register(publicBookingRoutes);
  await app.register(publicBookingConfirmationRoutes);
  await app.register(publicSlotHoldRoutes);
  await app.register(publicWaitlistRoutes);
  await app.register(publicDisputeMatchRoutes);
  await app.register(publicCalendarFeedRoutes);
}
