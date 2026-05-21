import type { ExtendedTransactionClient } from '../db/client.js';

// Returning-client recognition — the "Not You?" escape hatch (docs/04-booking-flow.md §B).
//
// When a guest submits the public booking form, we try to silently attach the
// new appointment to an existing client row instead of creating a duplicate.
// This is the matcher; it returns a decision + strength tag that the caller
// records on the appointment so staff can audit and clients can dispute.
//
// Strength tags persisted on Appointment.matchStrength (Prisma enum
// ClientMatchStrength):
//   strong     — email + phone matched a single existing client (high trust)
//   weak       — email matched but phone explicitly conflicted (we created
//                a NEW client; staff queue surfaces this to merge later)
//   name_only  — email matched, no phone given, first+last name matched
//                exactly one candidate (attach; lower trust)
//   ambiguous  — email + phone matched multiple candidates (rare; we created
//                a NEW client, staff resolves manually)
//
// The resolver's local 'none' tag means "no email match at all → caller
// creates a fresh client with matchStrength=null." It is NOT part of the
// Prisma enum.

export type ClientRecognitionMode =
  | 'email_only'
  | 'email_phone'
  | 'email_name'
  | 'email_phone_or_name';

export type ResolverStrength =
  | 'strong'
  | 'weak'
  | 'name_only'
  | 'ambiguous'
  | 'none';

export type ClientMatchDecision = {
  /** 'attach' = silent attach to existing client; 'create' = caller creates new client. */
  decision: 'attach' | 'create';
  /** Populated when decision = 'attach'. */
  matchedClientId: string | null;
  strength: ResolverStrength;
  /** True when the attach candidate is banned — caller should refuse the booking. */
  matchedClientWasBanned: boolean;
};

// Cap candidates returned per submitted email. Mirrors the cap in
// clientService.findDuplicates — defensive against runaway email-collision
// rows. Match-quality branching is pure-JS once we have the list.
const CANDIDATE_LIMIT = 10;

function normalize(s: string | undefined | null): string {
  return (s ?? '').trim().toLowerCase();
}

function namesMatch(
  candidate: { firstName: string; lastName: string | null },
  submitted: { firstName: string; lastName: string | undefined },
): boolean {
  // Last name required on both sides for a "name match" — first-name-only
  // collisions in a busy salon would be too noisy.
  const subLast = normalize(submitted.lastName);
  const candLast = normalize(candidate.lastName);
  if (!subLast || !candLast) return false;
  return (
    normalize(candidate.firstName) === normalize(submitted.firstName) &&
    candLast === subLast
  );
}

export async function resolveClientMatch(
  tx: ExtendedTransactionClient,
  args: {
    tenantId: string;
    recognitionMode: ClientRecognitionMode;
    email: string;
    phone: string | undefined;
    firstName: string;
    lastName: string | undefined;
  },
): Promise<ClientMatchDecision> {
  const submittedEmail = args.email.trim();
  const submittedPhone = args.phone?.trim() || undefined;

  // One query: email-equal candidates, capped, oldest first (createdAt ASC) so
  // 'first candidate wins' in email_only mode is stable.
  const candidates = await tx.client.findMany({
    where: {
      tenantId: args.tenantId,
      email: { equals: submittedEmail, mode: 'insensitive' },
    },
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      banned: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: CANDIDATE_LIMIT,
  });

  // No email match → caller creates a fresh row, no recognition signal on
  // the appointment. 'none' translates to null at the service boundary.
  if (candidates.length === 0) {
    return {
      decision: 'create',
      matchedClientId: null,
      strength: 'none',
      matchedClientWasBanned: false,
    };
  }

  // email_only: loosest mode. First candidate wins regardless of phone/name.
  if (args.recognitionMode === 'email_only') {
    const first = candidates[0]!;
    return {
      decision: 'attach',
      matchedClientId: first.id,
      strength: 'strong',
      matchedClientWasBanned: first.banned,
    };
  }

  const modeUsesPhone =
    args.recognitionMode === 'email_phone' ||
    args.recognitionMode === 'email_phone_or_name';
  const modeUsesName =
    args.recognitionMode === 'email_name' ||
    args.recognitionMode === 'email_phone_or_name';

  // Phone branch: only meaningful if the mode uses phone AND the submitter
  // gave us a phone to compare against.
  if (modeUsesPhone && submittedPhone) {
    const phoneMatches = candidates.filter(
      (c) => normalize(c.phone) === normalize(submittedPhone),
    );

    if (phoneMatches.length === 1) {
      const hit = phoneMatches[0]!;
      return {
        decision: 'attach',
        matchedClientId: hit.id,
        strength: 'strong',
        matchedClientWasBanned: hit.banned,
      };
    }

    if (phoneMatches.length > 1) {
      // Same email + same phone on multiple rows → staff must resolve.
      return {
        decision: 'create',
        matchedClientId: null,
        strength: 'ambiguous',
        matchedClientWasBanned: false,
      };
    }

    // phoneMatches.length === 0 — phone explicitly conflicted with every
    // candidate. In hybrid mode, try name as a fallback before giving up.
    if (args.recognitionMode === 'email_phone_or_name' && modeUsesName) {
      const nameMatches = candidates.filter((c) =>
        namesMatch(c, { firstName: args.firstName, lastName: args.lastName }),
      );
      if (nameMatches.length === 1) {
        const hit = nameMatches[0]!;
        return {
          decision: 'attach',
          matchedClientId: hit.id,
          strength: 'name_only',
          matchedClientWasBanned: hit.banned,
        };
      }
    }

    // Email matched, phone given, no phone-or-name attach possible → weak.
    return {
      decision: 'create',
      matchedClientId: null,
      strength: 'weak',
      matchedClientWasBanned: false,
    };
  }

  // No phone branch (mode doesn't use phone, or submitter gave none).
  // Try name-only fallback when the mode allows.
  if (modeUsesName) {
    const nameMatches = candidates.filter((c) =>
      namesMatch(c, { firstName: args.firstName, lastName: args.lastName }),
    );
    if (nameMatches.length === 1) {
      const hit = nameMatches[0]!;
      return {
        decision: 'attach',
        matchedClientId: hit.id,
        strength: 'name_only',
        matchedClientWasBanned: hit.banned,
      };
    }
    // Email matched but name didn't (or matched many) → create a new row.
    // No phone was compared, so this isn't a 'weak' phone conflict.
    return {
      decision: 'create',
      matchedClientId: null,
      strength: 'weak',
      matchedClientWasBanned: false,
    };
  }

  // Mode is email_phone but no phone was submitted → can't strengthen the
  // email match; create a new row rather than blindly attach.
  return {
    decision: 'create',
    matchedClientId: null,
    strength: 'weak',
    matchedClientWasBanned: false,
  };
}
