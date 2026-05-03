import { z } from 'zod';

const TRIM_NONEMPTY = z.string().trim().min(1);

const QueryBoolFlag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true' || v === '1');

export const CreateServiceCategoryBodySchema = z.object({
  name: TRIM_NONEMPTY.max(120),
  displayOrder: z.number().int().min(0).max(100_000).optional(),
});
export type CreateServiceCategoryBody = z.infer<
  typeof CreateServiceCategoryBodySchema
>;

export const UpdateServiceCategoryBodySchema =
  CreateServiceCategoryBodySchema.partial();
export type UpdateServiceCategoryBody = z.infer<
  typeof UpdateServiceCategoryBodySchema
>;

export const ListServiceCategoriesQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
  includeDeleted: QueryBoolFlag,
});
export type ListServiceCategoriesQuery = z.infer<
  typeof ListServiceCategoriesQuerySchema
>;

export const ServiceCategoryIdParamsSchema = z.object({
  id: z.string().min(1),
});
export type ServiceCategoryIdParams = z.infer<
  typeof ServiceCategoryIdParamsSchema
>;
