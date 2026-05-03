import { z } from 'zod';

export const StaffScheduleBlockIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const ListStaffScheduleBlocksQuerySchema = z.object({
  staffId: z.string().min(1),
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export type ListStaffScheduleBlocksQuery = z.infer<
  typeof ListStaffScheduleBlocksQuerySchema
>;

const categoryEnum = z.enum([
  'break',
  'lunch',
  'pto',
  'meeting',
  'training',
  'maintenance',
  'closure',
  'custom',
]);

const visibilityEnum = z.enum(['internal', 'public_busy']);

export const CreateStaffScheduleBlockBodySchema = z
  .object({
    staffId: z.string().min(1),
    locationId: z.string().min(1).nullable().optional(),
    title: z.string().trim().min(1).max(200),
    category: categoryEnum,
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    visibility: visibilityEnum.optional(),
  })
  .superRefine((data, ctx) => {
    const start = new Date(data.startsAt);
    const end = new Date(data.endsAt);
    if (!(end > start)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endsAt must be after startsAt.',
        path: ['endsAt'],
      });
    }
  });

export type CreateStaffScheduleBlockBody = z.infer<
  typeof CreateStaffScheduleBlockBodySchema
>;

export const UpdateStaffScheduleBlockBodySchema = z
  .object({
    locationId: z.string().min(1).nullable().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    category: categoryEnum.optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    visibility: visibilityEnum.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startsAt !== undefined && data.endsAt !== undefined) {
      const start = new Date(data.startsAt);
      const end = new Date(data.endsAt);
      if (!(end > start)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'endsAt must be after startsAt.',
          path: ['endsAt'],
        });
      }
    }
  });

export type UpdateStaffScheduleBlockBody = z.infer<
  typeof UpdateStaffScheduleBlockBodySchema
>;
