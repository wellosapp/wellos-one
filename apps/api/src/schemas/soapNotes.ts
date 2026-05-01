import { z } from 'zod';

// Zod schemas for SOAP notes (E3-S4f).
//
// Per master-spec §5.2.5 + walkthrough v2-notes §6.2 (staff view).
//
// Lifecycle:
//   create  → editable (locked=false)
//   lock    → locked=true; in-place PATCH is rejected
//   revise  → locked notes accept revisions which append to
//             SoapNoteRevision (append-only) AND update the main row
//
// Multiple SOAP notes per appointment are allowed (Q2 from the schema PR
// — multi-stage procedures). No DB unique on (appointmentId).

const TRIM_NONEMPTY = z.string().trim().min(1);

// SOAP body fields. All four are optional on create — staff can scaffold
// the note ahead of the visit and fill sections as they go.
const SOAP_BODY_FIELD = z
  .string()
  .max(20_000)
  .optional()
  .or(z.literal('').transform(() => undefined));

// ICD/CPT codes — short-string array, capped at 50 entries to prevent
// abuse. Format validation deferred to a future medical-coding library.
const CODE_LIST = z
  .array(z.string().trim().min(1).max(20))
  .max(50)
  .optional()
  .transform((v) => v ?? []);

export const CreateSoapNoteBodySchema = z.object({
  authorStaffId: TRIM_NONEMPTY,
  subjective: SOAP_BODY_FIELD,
  objective: SOAP_BODY_FIELD,
  assessment: SOAP_BODY_FIELD,
  plan: SOAP_BODY_FIELD,
  additionalNotes: SOAP_BODY_FIELD,
  templateId: z
    .string()
    .min(1)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  icdCodes: CODE_LIST,
  cptCodes: CODE_LIST,
});
export type CreateSoapNoteBody = z.infer<typeof CreateSoapNoteBodySchema>;

// PATCH only allowed when locked=false. authorStaffId is immutable
// post-create (audit anchor). templateId can change if the staff swaps
// templates mid-draft.
export const UpdateSoapNoteBodySchema = z
  .object({
    subjective: SOAP_BODY_FIELD,
    objective: SOAP_BODY_FIELD,
    assessment: SOAP_BODY_FIELD,
    plan: SOAP_BODY_FIELD,
    additionalNotes: SOAP_BODY_FIELD,
    templateId: z.string().min(1).nullable().optional(),
    icdCodes: z.array(z.string().trim().min(1).max(20)).max(50).optional(),
    cptCodes: z.array(z.string().trim().min(1).max(20)).max(50).optional(),
  })
  .strict();
export type UpdateSoapNoteBody = z.infer<typeof UpdateSoapNoteBodySchema>;

export const LockSoapNoteBodySchema = z.object({
  staffId: TRIM_NONEMPTY,
});
export type LockSoapNoteBody = z.infer<typeof LockSoapNoteBodySchema>;

// Revising a locked SOAP note. revisionReason is required for audit —
// "Lab result corrected" / "Updated assessment per supervising MD".
export const ReviseSoapNoteBodySchema = z.object({
  revisedByStaffId: TRIM_NONEMPTY,
  revisionReason: z.string().trim().min(3).max(500),
  // Body fields — at least one must be provided.
  subjective: SOAP_BODY_FIELD,
  objective: SOAP_BODY_FIELD,
  assessment: SOAP_BODY_FIELD,
  plan: SOAP_BODY_FIELD,
  additionalNotes: SOAP_BODY_FIELD,
}).refine(
  (v) =>
    v.subjective !== undefined ||
    v.objective !== undefined ||
    v.assessment !== undefined ||
    v.plan !== undefined ||
    v.additionalNotes !== undefined,
  { message: 'At least one SOAP field must change in a revision.' },
);
export type ReviseSoapNoteBody = z.infer<typeof ReviseSoapNoteBodySchema>;

export const AppointmentIdParamsSchema = z.object({
  appointmentId: z.string().min(1),
});
export type AppointmentIdParams = z.infer<typeof AppointmentIdParamsSchema>;

export const SoapNoteIdParamsSchema = z.object({
  appointmentId: z.string().min(1),
  noteId: z.string().min(1),
});
export type SoapNoteIdParams = z.infer<typeof SoapNoteIdParamsSchema>;
