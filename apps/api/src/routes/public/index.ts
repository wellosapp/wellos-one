import type { FastifyInstance } from 'fastify';

import publicCalendarFeedRoutes from './calendar-feed.js';

/** Login-free surfaces (Epic 4 booking lands separately on main). */
export default async function publicRoutes(app: FastifyInstance): Promise<void> {
  await app.register(publicCalendarFeedRoutes);
}
