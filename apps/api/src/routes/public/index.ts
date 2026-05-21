import type { FastifyInstance } from 'fastify';

import publicBookingRoutes from './booking.js';
import publicCalendarFeedRoutes from './calendar-feed.js';
import publicSlotHoldRoutes from './slot-holds.js';

/** Login-free surfaces — booking (Epic 4) and staff calendar feed (Epic 7). */
export default async function publicRoutes(app: FastifyInstance): Promise<void> {
  await app.register(publicBookingRoutes);
  await app.register(publicSlotHoldRoutes);
  await app.register(publicCalendarFeedRoutes);
}
