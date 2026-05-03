import type { FastifyInstance } from 'fastify';

import { requireRole } from '../../middleware/requireRole.js';

/**
 * GET /admin/onboarding/status — placeholder until the multi-step onboarding
 * wizard + OnboardingDraft APIs ship (`docs/11-onboarding-buildout.md`).
 */
export default async function onboardingRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    '/onboarding/status',
    { preHandler: requireRole.staff },
    async () => ({
      status: 'not_configured' as const,
      message: 'Onboarding wizard not yet implemented',
    }),
  );
}
