import { z } from 'zod';

// Zod schemas for ServiceContentDelivery (E3-S4e).
//
// Per master-spec §5.7.5 + master-spec §3.2 — defines per-service
// scheduled content (prep instructions, aftercare, reminders with
// content) sent over SMS/email at a configurable offset relative to
// the appointment.
//
// Unique constraint at DB level: (serviceId, deliveryType, channel).
// One service can have at most one row per (deliveryType, channel),
// so a duplicate triggers P2002 → InvalidContentDeliveryReferenceError.

// Mirrors ServiceContentDeliveryType (schema.prisma:184).
export const DeliveryTypeSchema = z.enum([
  'prep',
  'aftercare',
  'reminder_with_content',
]);
export type DeliveryTypeInput = z.infer<typeof DeliveryTypeSchema>;

// Mirrors ServiceContentDeliveryChannel.
export const DeliveryChannelSchema = z.enum(['sms', 'email', 'both']);
export type DeliveryChannelInput = z.infer<typeof DeliveryChannelSchema>;

// Schedule offset in minutes relative to scheduled_start_at.
//   prep:                    typically negative (before)
//   aftercare:               typically positive (after)
//   reminder_with_content:   either — pre-visit nudge or follow-up
//
// Bounds: ±30 days (43200 minutes). Outside that, the delivery probably
// belongs to a campaign or a separate automation flow, not a per-service
// content delivery.
const SCHEDULE_OFFSET = z
  .number()
  .int()
  .min(-43_200, 'offset must be within ±30 days')
  .max(43_200, 'offset must be within ±30 days');

// Optional override markdown. Null/empty falls back to the service's R2
// docs at services/{id}/docs/{prep,aftercare}.md.
const TEMPLATE_OVERRIDE = z
  .string()
  .max(20_000)
  .optional()
  .or(z.literal('').transform(() => undefined));

export const CreateContentDeliveryBodySchema = z.object({
  deliveryType: DeliveryTypeSchema,
  channel: DeliveryChannelSchema,
  scheduleOffsetMinutes: SCHEDULE_OFFSET,
  isEnabled: z.boolean().optional(),
  templateOverrideMarkdown: TEMPLATE_OVERRIDE,
});
export type CreateContentDeliveryBody = z.infer<
  typeof CreateContentDeliveryBodySchema
>;

// PATCH allows the safe subset. (deliveryType, channel) form the unique
// key — editing them is supported but a P2002 collision returns 400 with
// a duplicate-key field error (see service layer).
export const UpdateContentDeliveryBodySchema = z
  .object({
    deliveryType: DeliveryTypeSchema.optional(),
    channel: DeliveryChannelSchema.optional(),
    scheduleOffsetMinutes: SCHEDULE_OFFSET.optional(),
    isEnabled: z.boolean().optional(),
    templateOverrideMarkdown: z
      .string()
      .max(20_000)
      .nullable()
      .optional(),
  })
  .strict();
export type UpdateContentDeliveryBody = z.infer<
  typeof UpdateContentDeliveryBodySchema
>;

export const ServiceIdParamsSchema = z.object({
  serviceId: z.string().min(1),
});
export type ServiceIdParams = z.infer<typeof ServiceIdParamsSchema>;

export const DeliveryIdParamsSchema = z.object({
  serviceId: z.string().min(1),
  deliveryId: z.string().min(1),
});
export type DeliveryIdParams = z.infer<typeof DeliveryIdParamsSchema>;
