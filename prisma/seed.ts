// Idempotent seed: roles + the global feature-flag catalog.
//
// Run via the Prisma CLI:
//   pnpm --filter @wellos/api exec prisma db seed
// Or from the repo root (uses the `prisma.seed` field in root package.json):
//   pnpm prisma db seed
//
// This seed creates:
//   - 3 roles (admin, manager, staff)
//   - 19 feature flags (the Studio plan catalog from
//     docs/wellos-studio-start-plan.md "Studio Feature Flags")
//   - 16 global form templates (Forms System PR 4)
//
// It does NOT create tenants, users, or role assignments — those land via
// the Clerk webhook (Epic 1, sub-step 7) and the bootstrap admin script
// (Epic 1, sub-step 9).

import { PrismaClient } from '@prisma/client';

import { seedFormTemplates } from './seeds/form-templates';

// Prefer DIRECT_URL (session pooler, port 5432) for one-off scripts —
// the transaction pooler (DATABASE_URL, port 6543) breaks Prisma's
// prepared statements ("prepared statement s0 already exists") even
// with ?pgbouncer=true. The session pooler handles them correctly.
// Falls back to DATABASE_URL if DIRECT_URL isn't set.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : {});

const ROLES = [
  { name: 'admin', description: 'Full tenant access; can manage users, roles, billing, and all data.' },
  { name: 'manager', description: 'Operational control; manages staff, schedule, and most settings except billing.' },
  { name: 'staff', description: 'Therapist or service provider; manages own calendar and assigned clients.' },
] as const;

// The Studio plan: 8 enabled, 11 disabled. Per
// docs/wellos-studio-start-plan.md "Studio Feature Flags".
const FEATURE_FLAGS = [
  // Enabled by default for the Studio plan
  { key: 'calendar', defaultEnabled: true, category: 'core', description: 'Booking calendar UI' },
  { key: 'public_booking', defaultEnabled: true, category: 'core', description: 'Public client-facing booking page' },
  { key: 'sms_notifications', defaultEnabled: true, category: 'notifications', description: 'SMS reminders and confirmations via TextLink' },
  { key: 'email_notifications', defaultEnabled: true, category: 'notifications', description: 'Transactional email via Postmark' },
  { key: 'client_crm', defaultEnabled: true, category: 'core', description: 'Client records, notes, tags' },
  { key: 'stripe_payments', defaultEnabled: true, category: 'payments', description: 'Stripe checkout and Connect payouts' },
  { key: 'basic_reports', defaultEnabled: true, category: 'reporting', description: 'Standard revenue and appointment reports' },
  { key: 'single_location_ui', defaultEnabled: true, category: 'core', description: 'Single-location simplified UI for Studio' },

  // Disabled — unlocked by upgrading to the full Wellos plan
  { key: 'classes', defaultEnabled: false, category: 'scheduling', description: 'Group classes and class series' },
  { key: 'memberships', defaultEnabled: false, category: 'commerce', description: 'Recurring membership billing' },
  { key: 'packages', defaultEnabled: false, category: 'commerce', description: 'Pre-paid service packages' },
  { key: 'inventory', defaultEnabled: false, category: 'commerce', description: 'Retail inventory tracking' },
  { key: 'payroll', defaultEnabled: false, category: 'operations', description: 'Staff payroll and commission processing' },
  { key: 'marketing_campaigns', defaultEnabled: false, category: 'marketing', description: 'Email and SMS marketing campaigns' },
  { key: 'automations', defaultEnabled: false, category: 'operations', description: 'n8n workflow automations' },
  { key: 'public_api', defaultEnabled: false, category: 'platform', description: 'Public REST API for tenant integrations' },
  { key: 'advanced_forms', defaultEnabled: false, category: 'intake', description: 'Conditional logic, file uploads, signatures in intake forms' },
  { key: 'protected_records', defaultEnabled: false, category: 'compliance', description: 'HIPAA-track records with extra audit + storage controls' },
  { key: 'multi_location_ui', defaultEnabled: false, category: 'core', description: 'Multi-location switcher and per-location settings' },
] as const;

async function main(): Promise<void> {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      create: role,
      update: { description: role.description },
    });
  }
  console.log(`Seeded ${ROLES.length} roles.`);

  for (const flag of FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      create: flag,
      update: {
        defaultEnabled: flag.defaultEnabled,
        category: flag.category,
        description: flag.description,
      },
    });
  }
  console.log(`Seeded ${FEATURE_FLAGS.length} feature flags.`);

  await seedFormTemplates(prisma);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
