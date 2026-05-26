'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api/client';
import {
  createServiceFormRule,
  deleteServiceFormRule,
  updateServiceFormRule,
  type RequiredLevel,
  type Timing,
  type UpdateFormAssignmentRuleBody,
  type UpsertFormAssignmentRuleBody,
} from '@/lib/api/service-form-rules';

// Server actions for the Required Forms section on /admin/services/[id].
// Mirrors the shape used by the existing /admin/services/_actions.ts.

export type RuleActionState = {
  ok: boolean;
  error?: string;
};

const REQUIRED_LEVELS: RequiredLevel[] = ['optional', 'soft_required', 'hard_required'];
const TIMINGS: Timing[] = ['before_booking', 'before_appointment', 'optional'];

function readRequiredLevel(formData: FormData): RequiredLevel | undefined {
  const raw = formData.get('requiredLevel');
  if (typeof raw !== 'string') return undefined;
  return (REQUIRED_LEVELS as string[]).includes(raw)
    ? (raw as RequiredLevel)
    : undefined;
}

function readTiming(formData: FormData): Timing | undefined {
  const raw = formData.get('timing');
  if (typeof raw !== 'string') return undefined;
  return (TIMINGS as string[]).includes(raw) ? (raw as Timing) : undefined;
}

function readBool(formData: FormData, key: string): boolean {
  return formData.get(key) === '1' || formData.get(key) === 'on';
}

function readExpiresAfterDays(formData: FormData): number | null | undefined {
  const raw = formData.get('expiresAfterDays');
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === 'null') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 365) {
    return undefined;
  }
  return n;
}

function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) {
      return 'This form is already attached to this service.';
    }
    if (err.status === 404) {
      const body = err.body;
      if (
        body &&
        typeof body === 'object' &&
        'code' in body &&
        typeof (body as { code: unknown }).code === 'string' &&
        (body as { code: string }).code === 'FORM_DEFINITION_GROUP_NOT_FOUND'
      ) {
        return 'That form no longer exists in this tenant.';
      }
      return 'Service or rule not found.';
    }
    if (err.status === 403) {
      return 'You do not have admin access to attach forms.';
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

export async function createServiceFormRuleAction(
  serviceId: string,
  _prev: RuleActionState,
  formData: FormData,
): Promise<RuleActionState> {
  const formDefinitionGroupId = formData.get('formDefinitionGroupId');
  if (typeof formDefinitionGroupId !== 'string' || formDefinitionGroupId.trim() === '') {
    return { ok: false, error: 'Pick a form to attach.' };
  }

  const requiredLevel = readRequiredLevel(formData);
  const timing = readTiming(formData);
  if (!requiredLevel || !timing) {
    return { ok: false, error: 'Required level and timing are required.' };
  }

  const expiresAfterDays = readExpiresAfterDays(formData);
  if (expiresAfterDays === undefined) {
    return {
      ok: false,
      error: 'Expires after must be a whole number from 1 to 365, or leave blank for never.',
    };
  }

  const body: UpsertFormAssignmentRuleBody = {
    formDefinitionGroupId: formDefinitionGroupId.trim(),
    requiredLevel,
    timing,
    sendAutomaticallyAfterBooking: readBool(formData, 'sendAutomaticallyAfterBooking'),
    requireProviderReview: readBool(formData, 'requireProviderReview'),
    expiresAfterDays,
    active: true,
  };

  try {
    await createServiceFormRule(serviceId, body);
  } catch (err) {
    return { ok: false, error: apiErrorMessage(err) };
  }

  revalidatePath(`/admin/services/${serviceId}`);
  return { ok: true };
}

export async function updateServiceFormRuleAction(
  serviceId: string,
  ruleId: string,
  _prev: RuleActionState,
  formData: FormData,
): Promise<RuleActionState> {
  const requiredLevel = readRequiredLevel(formData);
  const timing = readTiming(formData);
  if (!requiredLevel || !timing) {
    return { ok: false, error: 'Required level and timing are required.' };
  }

  const expiresAfterDays = readExpiresAfterDays(formData);
  if (expiresAfterDays === undefined) {
    return {
      ok: false,
      error: 'Expires after must be a whole number from 1 to 365, or leave blank for never.',
    };
  }

  const body: UpdateFormAssignmentRuleBody = {
    requiredLevel,
    timing,
    sendAutomaticallyAfterBooking: readBool(formData, 'sendAutomaticallyAfterBooking'),
    requireProviderReview: readBool(formData, 'requireProviderReview'),
    expiresAfterDays,
    active: readBool(formData, 'active'),
  };

  try {
    await updateServiceFormRule(serviceId, ruleId, body);
  } catch (err) {
    return { ok: false, error: apiErrorMessage(err) };
  }

  revalidatePath(`/admin/services/${serviceId}`);
  return { ok: true };
}

export async function deleteServiceFormRuleAction(
  serviceId: string,
  ruleId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await deleteServiceFormRule(serviceId, ruleId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      // Already gone — fine.
    } else {
      return { ok: false, error: apiErrorMessage(err) };
    }
  }
  revalidatePath(`/admin/services/${serviceId}`);
  return { ok: true };
}
