// Global form-template library. Idempotently upserts 16 starter templates by
// slug. Re-running the seed updates titles / descriptions / categories /
// schemas if we tweak them — the row `id` and `createdAt` stay stable.
//
// Templates are SYSTEM-OWNED. Every tenant sees the same catalog; cloning a
// template into a tenant copies the schema with all field/section IDs
// regenerated (see apps/api/src/services/intakeFormService.ts cloneFromTemplate).
//
// Schemas conform to the FormBuilderSchema shape declared in
// apps/web/app/admin/intake-forms/_schema-utils.ts (schemaVersion: 2,
// sections + flat fields with sectionId pointers). Field/section IDs here
// are stable strings so re-seeding doesn't churn — but they're regenerated
// to fresh cuids on every clone, so cross-tenant ID collisions are impossible.
//
// Each template is hand-drafted rather than generated — these are the user's
// first impression of the system.

import type { PrismaClient } from '@prisma/client';

// ---------- Helpers ----------

// Stable ID factory used only inside this seed file. The IDs are not random:
// they're string keys local to a template ("massage-intake/section-1",
// "massage-intake/field-2"). This makes re-seeding deterministic. Clones
// regenerate every ID, so leaking them across templates is harmless.
function sid(slug: string, kind: 'section' | 'field', n: number): string {
  return `tpl:${slug}:${kind}:${n}`;
}

interface TemplateField {
  id: string;
  type: string;
  sectionId: string | null;
  label: string;
  helperText?: string;
  placeholder?: string;
  required: boolean;
  internalKey: string;
  order: number;
  options?: { value: string; label: string }[];
  validation?: Record<string, unknown>;
}

interface TemplateSection {
  id: string;
  title: string;
  description?: string;
  order: number;
}

interface TemplateSchema {
  schemaVersion: 2;
  sections: TemplateSection[];
  fields: TemplateField[];
}

interface TemplateRecord {
  slug: string;
  title: string;
  description: string;
  formType: string;
  category: string;
  iconName: string;
  schema: TemplateSchema;
}

// ---------- Templates ----------

// 1. General Intake
function generalIntakeTemplate(): TemplateRecord {
  const slug = 'general-intake';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'General Intake',
    description:
      'Standard new-client intake covering contact details, emergency contact, and general health.',
    formType: 'intake',
    category: 'general',
    iconName: 'clipboard-list',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Personal information', order: 0 },
        { id: s(2), title: 'Emergency contact', order: 1 },
        { id: s(3), title: 'General health', order: 2 },
      ],
      fields: [
        { id: f(1), type: 'short_text', sectionId: s(1), label: 'Full name', required: true, internalKey: 'full_name', order: 0 },
        { id: f(2), type: 'email', sectionId: s(1), label: 'Email', required: true, internalKey: 'email', order: 1 },
        { id: f(3), type: 'phone', sectionId: s(1), label: 'Phone', required: true, internalKey: 'phone', order: 2 },
        { id: f(4), type: 'date', sectionId: s(1), label: 'Date of birth', required: false, internalKey: 'date_of_birth', order: 3 },
        { id: f(5), type: 'short_text', sectionId: s(1), label: 'How did you hear about us?', required: false, internalKey: 'referral_source', order: 4 },
        { id: f(6), type: 'short_text', sectionId: s(2), label: 'Emergency contact name', required: true, internalKey: 'emergency_contact_name', order: 0 },
        { id: f(7), type: 'phone', sectionId: s(2), label: 'Emergency contact phone', required: true, internalKey: 'emergency_contact_phone', order: 1 },
        { id: f(8), type: 'short_text', sectionId: s(2), label: 'Relationship', required: false, internalKey: 'emergency_contact_relationship', order: 2 },
        { id: f(9), type: 'yes_no', sectionId: s(3), label: 'Are you currently under a physician’s care?', required: true, internalKey: 'under_physician_care', order: 0 },
        { id: f(10), type: 'long_text', sectionId: s(3), label: 'List any medications you currently take', helperText: 'Include over-the-counter and supplements.', required: false, internalKey: 'current_medications', order: 1 },
        { id: f(11), type: 'long_text', sectionId: s(3), label: 'List any allergies', required: false, internalKey: 'allergies', order: 2 },
        { id: f(12), type: 'long_text', sectionId: s(3), label: 'Anything else we should know?', required: false, internalKey: 'other_notes', order: 3 },
      ],
    },
  };
}

// 2. Massage Intake
function massageIntakeTemplate(): TemplateRecord {
  const slug = 'massage-intake';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'Massage Intake',
    description:
      'Pre-massage intake capturing health history, focus areas, pressure preference, and goals.',
    formType: 'intake',
    category: 'massage',
    iconName: 'sparkles',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Your information', order: 0 },
        { id: s(2), title: 'Health history', order: 1 },
        { id: s(3), title: 'Focus areas and pressure', order: 2 },
        { id: s(4), title: 'Today’s session', order: 3 },
      ],
      fields: [
        { id: f(1), type: 'short_text', sectionId: s(1), label: 'Full name', required: true, internalKey: 'full_name', order: 0 },
        { id: f(2), type: 'email', sectionId: s(1), label: 'Email', required: true, internalKey: 'email', order: 1 },
        { id: f(3), type: 'phone', sectionId: s(1), label: 'Phone', required: true, internalKey: 'phone', order: 2 },
        { id: f(4), type: 'date', sectionId: s(1), label: 'Date of birth', required: false, internalKey: 'date_of_birth', order: 3 },
        { id: f(5), type: 'yes_no', sectionId: s(2), label: 'Are you pregnant?', required: false, internalKey: 'pregnant', order: 0 },
        { id: f(6), type: 'yes_no', sectionId: s(2), label: 'Do you have high blood pressure?', required: false, internalKey: 'high_blood_pressure', order: 1 },
        { id: f(7), type: 'yes_no', sectionId: s(2), label: 'Any recent injuries or surgeries?', required: false, internalKey: 'recent_injury_or_surgery', order: 2 },
        { id: f(8), type: 'long_text', sectionId: s(2), label: 'Medications and supplements', required: false, internalKey: 'medications', order: 3 },
        { id: f(9), type: 'long_text', sectionId: s(2), label: 'Allergies (lotions, oils, scents)', required: false, internalKey: 'allergies', order: 4 },
        { id: f(10), type: 'multi_select', sectionId: s(3), label: 'Where would you like us to focus?', required: false, internalKey: 'focus_areas', order: 0, options: [
          { value: 'neck_shoulders', label: 'Neck and shoulders' },
          { value: 'upper_back', label: 'Upper back' },
          { value: 'lower_back', label: 'Lower back' },
          { value: 'hips_glutes', label: 'Hips and glutes' },
          { value: 'legs', label: 'Legs' },
          { value: 'arms_hands', label: 'Arms and hands' },
          { value: 'feet', label: 'Feet' },
          { value: 'head_face_scalp', label: 'Head, face, scalp' },
        ] },
        { id: f(11), type: 'multi_select', sectionId: s(3), label: 'Any areas to avoid?', required: false, internalKey: 'avoid_areas', order: 1, options: [
          { value: 'face', label: 'Face' },
          { value: 'abdomen', label: 'Abdomen' },
          { value: 'feet', label: 'Feet' },
          { value: 'glutes', label: 'Glutes' },
        ] },
        { id: f(12), type: 'radio', sectionId: s(3), label: 'Preferred pressure', required: true, internalKey: 'pressure_preference', order: 2, options: [
          { value: 'light', label: 'Light' },
          { value: 'medium', label: 'Medium' },
          { value: 'firm', label: 'Firm' },
          { value: 'deep', label: 'Deep' },
        ] },
        { id: f(13), type: 'pain_scale', sectionId: s(3), label: 'Current pain level (0-10)', required: false, internalKey: 'current_pain_level', order: 3 },
        { id: f(14), type: 'long_text', sectionId: s(4), label: 'What would make today’s session a success?', required: false, internalKey: 'session_goal', order: 0 },
        { id: f(15), type: 'yes_no', sectionId: s(4), label: 'First time getting a professional massage?', required: false, internalKey: 'first_time', order: 1 },
        { id: f(16), type: 'long_text', sectionId: s(4), label: 'Anything else your therapist should know?', required: false, internalKey: 'additional_notes', order: 2 },
      ],
    },
  };
}

// 3. Medspa Intake
function medspaIntakeTemplate(): TemplateRecord {
  const slug = 'medspa-intake';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'Medspa Intake',
    description:
      'New-client intake for medspa visits — captures medical history, skin history, current medications, and goals.',
    formType: 'intake',
    category: 'medspa',
    iconName: 'sparkle',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Personal information', order: 0 },
        { id: s(2), title: 'Medical history', order: 1 },
        { id: s(3), title: 'Skin history', order: 2 },
        { id: s(4), title: 'Goals and expectations', order: 3 },
      ],
      fields: [
        { id: f(1), type: 'short_text', sectionId: s(1), label: 'Full name', required: true, internalKey: 'full_name', order: 0 },
        { id: f(2), type: 'date', sectionId: s(1), label: 'Date of birth', required: true, internalKey: 'date_of_birth', order: 1 },
        { id: f(3), type: 'email', sectionId: s(1), label: 'Email', required: true, internalKey: 'email', order: 2 },
        { id: f(4), type: 'phone', sectionId: s(1), label: 'Phone', required: true, internalKey: 'phone', order: 3 },
        { id: f(5), type: 'yes_no', sectionId: s(2), label: 'Are you pregnant or breastfeeding?', required: true, internalKey: 'pregnant_or_breastfeeding', order: 0 },
        { id: f(6), type: 'long_text', sectionId: s(2), label: 'Current medications', helperText: 'Include prescription and over-the-counter.', required: false, internalKey: 'medications', order: 1 },
        { id: f(7), type: 'long_text', sectionId: s(2), label: 'Allergies (medications, topical products, food)', required: false, internalKey: 'allergies', order: 2 },
        { id: f(8), type: 'multi_select', sectionId: s(2), label: 'Do any of the following apply to you?', required: false, internalKey: 'conditions', order: 3, options: [
          { value: 'autoimmune', label: 'Autoimmune disorder' },
          { value: 'diabetes', label: 'Diabetes' },
          { value: 'blood_thinners', label: 'On blood thinners' },
          { value: 'cancer_history', label: 'History of cancer' },
          { value: 'cold_sores', label: 'Cold sores / herpes simplex' },
          { value: 'keloid_scarring', label: 'Keloid scarring tendency' },
          { value: 'none', label: 'None of these' },
        ] },
        { id: f(9), type: 'long_text', sectionId: s(2), label: 'Prior cosmetic procedures', helperText: 'Botox, fillers, peels, laser, microneedling, etc.', required: false, internalKey: 'prior_procedures', order: 4 },
        { id: f(10), type: 'radio', sectionId: s(3), label: 'How would you describe your skin?', required: false, internalKey: 'skin_type', order: 0, options: [
          { value: 'dry', label: 'Dry' },
          { value: 'oily', label: 'Oily' },
          { value: 'combination', label: 'Combination' },
          { value: 'sensitive', label: 'Sensitive' },
          { value: 'normal', label: 'Normal' },
        ] },
        { id: f(11), type: 'yes_no', sectionId: s(3), label: 'Currently using retinoids or tretinoin?', required: false, internalKey: 'using_retinoids', order: 1 },
        { id: f(12), type: 'yes_no', sectionId: s(3), label: 'Any recent sun exposure or tanning bed use (within 2 weeks)?', required: false, internalKey: 'recent_sun_exposure', order: 2 },
        { id: f(13), type: 'yes_no', sectionId: s(3), label: 'Currently or recently taking Accutane (Isotretinoin)?', required: false, internalKey: 'accutane_use', order: 3 },
        { id: f(14), type: 'multi_select', sectionId: s(3), label: 'Primary skin concerns', required: false, internalKey: 'skin_concerns', order: 4, options: [
          { value: 'fine_lines', label: 'Fine lines and wrinkles' },
          { value: 'acne', label: 'Acne or breakouts' },
          { value: 'hyperpigmentation', label: 'Hyperpigmentation / dark spots' },
          { value: 'redness', label: 'Redness / rosacea' },
          { value: 'texture', label: 'Texture / pore size' },
          { value: 'volume_loss', label: 'Volume loss' },
          { value: 'scarring', label: 'Scarring' },
        ] },
        { id: f(15), type: 'long_text', sectionId: s(4), label: 'What treatments are you interested in?', required: false, internalKey: 'treatments_of_interest', order: 0 },
        { id: f(16), type: 'long_text', sectionId: s(4), label: 'What outcome would make this visit a success?', required: false, internalKey: 'desired_outcome', order: 1 },
        { id: f(17), type: 'yes_no', sectionId: s(4), label: 'Do you have an event or deadline in mind?', required: false, internalKey: 'has_event_deadline', order: 2 },
        { id: f(18), type: 'long_text', sectionId: s(4), label: 'Anything else we should know?', required: false, internalKey: 'additional_notes', order: 3 },
      ],
    },
  };
}

// 4. Medical History
function medicalHistoryTemplate(): TemplateRecord {
  const slug = 'medical-history';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'Medical History',
    description:
      'Comprehensive medical history — current conditions, medications, allergies, and family history.',
    formType: 'medical_history',
    category: 'wellness',
    iconName: 'heart-pulse',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Current conditions', order: 0 },
        { id: s(2), title: 'Medications and allergies', order: 1 },
        { id: s(3), title: 'Family history', order: 2 },
        { id: s(4), title: 'Lifestyle', order: 3 },
      ],
      fields: [
        { id: f(1), type: 'multi_select', sectionId: s(1), label: 'Do any of the following apply to you?', required: false, internalKey: 'current_conditions', order: 0, options: [
          { value: 'high_blood_pressure', label: 'High blood pressure' },
          { value: 'heart_disease', label: 'Heart disease' },
          { value: 'diabetes', label: 'Diabetes' },
          { value: 'asthma', label: 'Asthma' },
          { value: 'thyroid', label: 'Thyroid disorder' },
          { value: 'arthritis', label: 'Arthritis' },
          { value: 'depression_anxiety', label: 'Depression / anxiety' },
          { value: 'autoimmune', label: 'Autoimmune disorder' },
          { value: 'cancer', label: 'Cancer (current or past)' },
          { value: 'none', label: 'None of these' },
        ] },
        { id: f(2), type: 'long_text', sectionId: s(1), label: 'Other current or chronic conditions', required: false, internalKey: 'other_conditions', order: 1 },
        { id: f(3), type: 'long_text', sectionId: s(1), label: 'Recent surgeries or hospitalizations (last 2 years)', required: false, internalKey: 'recent_surgeries', order: 2 },
        { id: f(4), type: 'long_text', sectionId: s(2), label: 'Current medications', helperText: 'Include dosage if known.', required: false, internalKey: 'medications', order: 0 },
        { id: f(5), type: 'long_text', sectionId: s(2), label: 'Vitamins and supplements', required: false, internalKey: 'supplements', order: 1 },
        { id: f(6), type: 'long_text', sectionId: s(2), label: 'Medication allergies', required: false, internalKey: 'medication_allergies', order: 2 },
        { id: f(7), type: 'long_text', sectionId: s(2), label: 'Other allergies (food, environmental, topical)', required: false, internalKey: 'other_allergies', order: 3 },
        { id: f(8), type: 'multi_select', sectionId: s(3), label: 'Family history of:', required: false, internalKey: 'family_history', order: 0, options: [
          { value: 'heart_disease', label: 'Heart disease' },
          { value: 'stroke', label: 'Stroke' },
          { value: 'diabetes', label: 'Diabetes' },
          { value: 'cancer', label: 'Cancer' },
          { value: 'high_blood_pressure', label: 'High blood pressure' },
          { value: 'none_known', label: 'None known' },
        ] },
        { id: f(9), type: 'long_text', sectionId: s(3), label: 'Other family medical history of note', required: false, internalKey: 'other_family_history', order: 1 },
        { id: f(10), type: 'radio', sectionId: s(4), label: 'Do you smoke or use tobacco?', required: false, internalKey: 'tobacco_use', order: 0, options: [
          { value: 'never', label: 'Never' },
          { value: 'former', label: 'Former smoker' },
          { value: 'current', label: 'Currently' },
        ] },
        { id: f(11), type: 'radio', sectionId: s(4), label: 'Alcohol consumption', required: false, internalKey: 'alcohol_use', order: 1, options: [
          { value: 'none', label: 'None' },
          { value: 'occasional', label: 'Occasionally' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'daily', label: 'Daily' },
        ] },
        { id: f(12), type: 'short_text', sectionId: s(4), label: 'Average sleep per night (hours)', required: false, internalKey: 'sleep_hours', order: 2 },
        { id: f(13), type: 'short_text', sectionId: s(4), label: 'Exercise frequency (per week)', required: false, internalKey: 'exercise_frequency', order: 3 },
        { id: f(14), type: 'long_text', sectionId: s(4), label: 'Anything else we should know?', required: false, internalKey: 'additional_notes', order: 4 },
      ],
    },
  };
}

// 5. Injury History
function injuryHistoryTemplate(): TemplateRecord {
  const slug = 'injury-history';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'Injury History',
    description:
      'Captures past and current injuries, treatments tried, and ongoing limitations for fitness or bodywork.',
    formType: 'medical_history',
    category: 'fitness',
    iconName: 'bandage',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Areas affected', order: 0 },
        { id: s(2), title: 'Details', order: 1 },
      ],
      fields: [
        { id: f(1), type: 'multi_select', sectionId: s(1), label: 'Where have you had injuries?', required: false, internalKey: 'injured_areas', order: 0, options: [
          { value: 'neck', label: 'Neck' },
          { value: 'shoulders', label: 'Shoulders' },
          { value: 'upper_back', label: 'Upper back' },
          { value: 'lower_back', label: 'Lower back' },
          { value: 'hips', label: 'Hips' },
          { value: 'knees', label: 'Knees' },
          { value: 'ankles_feet', label: 'Ankles or feet' },
          { value: 'wrists_hands', label: 'Wrists or hands' },
          { value: 'elbows', label: 'Elbows' },
          { value: 'no_injuries', label: 'No prior injuries' },
        ] },
        { id: f(2), type: 'long_text', sectionId: s(2), label: 'Describe each injury', helperText: 'When it happened, how, and which side of the body.', required: false, internalKey: 'injury_description', order: 0 },
        { id: f(3), type: 'long_text', sectionId: s(2), label: 'Treatments you’ve tried', helperText: 'Physical therapy, chiropractic, surgery, etc.', required: false, internalKey: 'treatments_tried', order: 1 },
        { id: f(4), type: 'yes_no', sectionId: s(2), label: 'Do you still have pain in any of these areas?', required: false, internalKey: 'ongoing_pain', order: 2 },
        { id: f(5), type: 'pain_scale', sectionId: s(2), label: 'Current pain level (0-10)', required: false, internalKey: 'current_pain_level', order: 3 },
        { id: f(6), type: 'long_text', sectionId: s(2), label: 'Movements or activities that aggravate the pain', required: false, internalKey: 'aggravating_activities', order: 4 },
        { id: f(7), type: 'long_text', sectionId: s(2), label: 'Movements or positions that relieve it', required: false, internalKey: 'relieving_activities', order: 5 },
        { id: f(8), type: 'yes_no', sectionId: s(2), label: 'Cleared by a physician for exercise / bodywork?', required: false, internalKey: 'physician_cleared', order: 6 },
        { id: f(9), type: 'long_text', sectionId: s(2), label: 'Any movements or pressure to avoid?', required: false, internalKey: 'avoid_notes', order: 7 },
        { id: f(10), type: 'long_text', sectionId: s(2), label: 'Anything else we should know?', required: false, internalKey: 'additional_notes', order: 8 },
      ],
    },
  };
}

// 6. General Liability Waiver
function generalLiabilityWaiverTemplate(): TemplateRecord {
  const slug = 'general-liability-waiver';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'General Liability Waiver',
    description:
      'Standard release of liability acknowledging voluntary participation and assumption of risk.',
    formType: 'waiver',
    category: 'general',
    iconName: 'shield-check',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Acknowledgments', order: 0 },
        { id: s(2), title: 'Signature', order: 1 },
      ],
      fields: [
        { id: f(1), type: 'checkbox', sectionId: s(1), label: 'I am participating voluntarily and at my own risk.', required: true, internalKey: 'voluntary_participation', order: 0 },
        { id: f(2), type: 'checkbox', sectionId: s(1), label: 'I release the provider, staff, and facility from claims arising from ordinary negligence.', required: true, internalKey: 'release_liability', order: 1 },
        { id: f(3), type: 'checkbox', sectionId: s(1), label: 'I confirm I have disclosed all relevant medical conditions.', required: true, internalKey: 'medical_disclosure', order: 2 },
        { id: f(4), type: 'short_text', sectionId: s(2), label: 'Full legal name', required: true, internalKey: 'full_legal_name', order: 0 },
        { id: f(5), type: 'date', sectionId: s(2), label: 'Date', required: true, internalKey: 'signed_date', order: 1 },
        { id: f(6), type: 'signature', sectionId: s(2), label: 'Signature', required: true, internalKey: 'signature', order: 2 },
      ],
    },
  };
}

// 7. Waxing Consent
function waxingConsentTemplate(): TemplateRecord {
  const slug = 'waxing-consent';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'Waxing Consent',
    description:
      'Pre-waxing consent covering common contraindications, expectations, and aftercare.',
    formType: 'consent',
    category: 'salon',
    iconName: 'flame',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Contraindications', order: 0 },
        { id: s(2), title: 'Acknowledgments', order: 1 },
        { id: s(3), title: 'Signature', order: 2 },
      ],
      fields: [
        { id: f(1), type: 'multi_select', sectionId: s(1), label: 'Do any of these apply in the past 7 days?', required: false, internalKey: 'recent_contraindications', order: 0, options: [
          { value: 'retinoids', label: 'Used retinoids or tretinoin' },
          { value: 'sunburn', label: 'Sunburn in the area' },
          { value: 'recent_peel', label: 'Recent chemical peel or laser' },
          { value: 'accutane_6mo', label: 'Accutane in the past 6 months' },
          { value: 'none', label: 'None of these' },
        ] },
        { id: f(2), type: 'yes_no', sectionId: s(1), label: 'Any active skin conditions in the area (eczema, psoriasis, broken skin)?', required: true, internalKey: 'active_skin_conditions', order: 1 },
        { id: f(3), type: 'checkbox', sectionId: s(2), label: 'I understand that waxing may cause temporary redness, irritation, or ingrown hairs.', required: true, internalKey: 'temp_irritation_ack', order: 0 },
        { id: f(4), type: 'checkbox', sectionId: s(2), label: 'I will follow the aftercare instructions provided.', required: true, internalKey: 'aftercare_ack', order: 1 },
        { id: f(5), type: 'checkbox', sectionId: s(2), label: 'I confirm I have disclosed all medications and skin conditions relevant to this service.', required: true, internalKey: 'disclosure_ack', order: 2 },
        { id: f(6), type: 'short_text', sectionId: s(3), label: 'Full legal name', required: true, internalKey: 'full_legal_name', order: 0 },
        { id: f(7), type: 'date', sectionId: s(3), label: 'Date', required: true, internalKey: 'signed_date', order: 1 },
        { id: f(8), type: 'signature', sectionId: s(3), label: 'Signature', required: true, internalKey: 'signature', order: 2 },
      ],
    },
  };
}

// 8. Botox / Filler Consent
function botoxFillerConsentTemplate(): TemplateRecord {
  const slug = 'botox-filler-consent';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'Botox / Filler Consent',
    description:
      'Informed consent for neuromodulator and dermal filler injections, covering risks and contraindications.',
    formType: 'consent',
    category: 'medspa',
    iconName: 'syringe',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Contraindications', order: 0 },
        { id: s(2), title: 'Risks and acknowledgments', order: 1 },
        { id: s(3), title: 'Signature', order: 2 },
      ],
      fields: [
        { id: f(1), type: 'yes_no', sectionId: s(1), label: 'Are you pregnant or breastfeeding?', required: true, internalKey: 'pregnant_breastfeeding', order: 0 },
        { id: f(2), type: 'yes_no', sectionId: s(1), label: 'Do you have a neuromuscular disorder (e.g. myasthenia gravis, ALS)?', required: true, internalKey: 'neuromuscular_disorder', order: 1 },
        { id: f(3), type: 'yes_no', sectionId: s(1), label: 'Are you allergic to botulinum toxin or any filler ingredient?', required: true, internalKey: 'product_allergies', order: 2 },
        { id: f(4), type: 'yes_no', sectionId: s(1), label: 'On blood thinners or aspirin?', required: true, internalKey: 'blood_thinners', order: 3 },
        { id: f(5), type: 'checkbox', sectionId: s(2), label: 'I understand common side effects: bruising, swelling, tenderness, headache, asymmetry.', required: true, internalKey: 'common_side_effects_ack', order: 0 },
        { id: f(6), type: 'checkbox', sectionId: s(2), label: 'I understand rare but serious risks include infection, vascular occlusion, and (very rarely) blindness with filler near the eyes.', required: true, internalKey: 'serious_risks_ack', order: 1 },
        { id: f(7), type: 'checkbox', sectionId: s(2), label: 'I understand results are not permanent and individual outcomes vary.', required: true, internalKey: 'results_vary_ack', order: 2 },
        { id: f(8), type: 'short_text', sectionId: s(3), label: 'Full legal name', required: true, internalKey: 'full_legal_name', order: 0 },
        { id: f(9), type: 'date', sectionId: s(3), label: 'Date', required: true, internalKey: 'signed_date', order: 1 },
        { id: f(10), type: 'signature', sectionId: s(3), label: 'Signature', required: true, internalKey: 'signature', order: 2 },
      ],
    },
  };
}

// 9. Chemical Peel Consent
function chemicalPeelConsentTemplate(): TemplateRecord {
  const slug = 'chemical-peel-consent';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'Chemical Peel Consent',
    description:
      'Informed consent for chemical peel procedures with skin sensitivity questions and post-care commitments.',
    formType: 'consent',
    category: 'medspa',
    iconName: 'droplet',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Skin sensitivity', order: 0 },
        { id: s(2), title: 'Risks and post-care', order: 1 },
        { id: s(3), title: 'Signature', order: 2 },
      ],
      fields: [
        { id: f(1), type: 'yes_no', sectionId: s(1), label: 'Currently using retinoids, tretinoin, or AHA/BHA products?', required: true, internalKey: 'using_retinoids', order: 0 },
        { id: f(2), type: 'yes_no', sectionId: s(1), label: 'Sun exposure or tanning within the past 2 weeks?', required: true, internalKey: 'recent_sun', order: 1 },
        { id: f(3), type: 'yes_no', sectionId: s(1), label: 'History of cold sores or herpes simplex?', required: true, internalKey: 'cold_sores_history', order: 2 },
        { id: f(4), type: 'yes_no', sectionId: s(1), label: 'History of keloid or hypertrophic scarring?', required: true, internalKey: 'keloid_history', order: 3 },
        { id: f(5), type: 'checkbox', sectionId: s(2), label: 'I understand peeling, redness, and dryness are expected for several days.', required: true, internalKey: 'expected_effects_ack', order: 0 },
        { id: f(6), type: 'checkbox', sectionId: s(2), label: 'I understand uncommon risks include uneven pigmentation, prolonged redness, and scarring.', required: true, internalKey: 'uncommon_risks_ack', order: 1 },
        { id: f(7), type: 'checkbox', sectionId: s(2), label: 'I will avoid sun exposure and use SPF 30+ daily during recovery.', required: true, internalKey: 'spf_commitment', order: 2 },
        { id: f(8), type: 'short_text', sectionId: s(3), label: 'Full legal name', required: true, internalKey: 'full_legal_name', order: 0 },
        { id: f(9), type: 'date', sectionId: s(3), label: 'Date', required: true, internalKey: 'signed_date', order: 1 },
        { id: f(10), type: 'signature', sectionId: s(3), label: 'Signature', required: true, internalKey: 'signature', order: 2 },
      ],
    },
  };
}

// 10. Microneedling Consent
function microneedlingConsentTemplate(): TemplateRecord {
  const slug = 'microneedling-consent';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'Microneedling Consent',
    description:
      'Informed consent for microneedling, including contraindications and expected recovery.',
    formType: 'consent',
    category: 'medspa',
    iconName: 'sparkle',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Skin condition', order: 0 },
        { id: s(2), title: 'Risks and acknowledgments', order: 1 },
        { id: s(3), title: 'Signature', order: 2 },
      ],
      fields: [
        { id: f(1), type: 'yes_no', sectionId: s(1), label: 'Active acne, eczema, or rosacea in the treatment area?', required: true, internalKey: 'active_skin_condition', order: 0 },
        { id: f(2), type: 'yes_no', sectionId: s(1), label: 'On Accutane in the past 6 months?', required: true, internalKey: 'recent_accutane', order: 1 },
        { id: f(3), type: 'yes_no', sectionId: s(1), label: 'History of cold sores or herpes simplex?', required: true, internalKey: 'cold_sores_history', order: 2 },
        { id: f(4), type: 'yes_no', sectionId: s(1), label: 'Open wounds, sunburn, or recent peel in the area?', required: true, internalKey: 'compromised_skin', order: 3 },
        { id: f(5), type: 'checkbox', sectionId: s(2), label: 'I understand redness and pinpoint bleeding are expected during the procedure.', required: true, internalKey: 'pinpoint_bleeding_ack', order: 0 },
        { id: f(6), type: 'checkbox', sectionId: s(2), label: 'I understand recovery typically includes 24-72 hours of redness and mild swelling.', required: true, internalKey: 'recovery_ack', order: 1 },
        { id: f(7), type: 'checkbox', sectionId: s(2), label: 'I understand uncommon risks include infection, hyperpigmentation, and scarring.', required: true, internalKey: 'uncommon_risks_ack', order: 2 },
        { id: f(8), type: 'short_text', sectionId: s(3), label: 'Full legal name', required: true, internalKey: 'full_legal_name', order: 0 },
        { id: f(9), type: 'date', sectionId: s(3), label: 'Date', required: true, internalKey: 'signed_date', order: 1 },
        { id: f(10), type: 'signature', sectionId: s(3), label: 'Signature', required: true, internalKey: 'signature', order: 2 },
      ],
    },
  };
}

// 11. COVID Health Screening
function covidScreeningTemplate(): TemplateRecord {
  const slug = 'covid-health-screening';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'COVID Health Screening',
    description:
      'Brief same-day screening for COVID-like symptoms and recent exposure before in-person services.',
    formType: 'intake',
    category: 'general',
    iconName: 'shield-check',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Symptom check', order: 0 },
      ],
      fields: [
        { id: f(1), type: 'multi_select', sectionId: s(1), label: 'In the past 48 hours, have you had any of these?', required: false, internalKey: 'symptoms', order: 0, options: [
          { value: 'fever', label: 'Fever or chills' },
          { value: 'cough', label: 'Cough' },
          { value: 'shortness_of_breath', label: 'Shortness of breath' },
          { value: 'loss_of_taste_smell', label: 'Loss of taste or smell' },
          { value: 'sore_throat', label: 'Sore throat' },
          { value: 'fatigue', label: 'Unusual fatigue' },
          { value: 'none', label: 'None of these' },
        ] },
        { id: f(2), type: 'yes_no', sectionId: s(1), label: 'Tested positive for COVID-19 in the past 10 days?', required: true, internalKey: 'recent_positive_test', order: 1 },
        { id: f(3), type: 'yes_no', sectionId: s(1), label: 'Close contact with a confirmed case in the past 5 days?', required: true, internalKey: 'recent_exposure', order: 2 },
        { id: f(4), type: 'checkbox', sectionId: s(1), label: 'I confirm my answers are accurate as of today.', required: true, internalKey: 'accuracy_ack', order: 3 },
        { id: f(5), type: 'date', sectionId: s(1), label: 'Date', required: true, internalKey: 'signed_date', order: 4 },
        { id: f(6), type: 'signature', sectionId: s(1), label: 'Signature', required: true, internalKey: 'signature', order: 5 },
      ],
    },
  };
}

// 12. Pre-Workout Clearance (PAR-Q style)
function preWorkoutClearanceTemplate(): TemplateRecord {
  const slug = 'pre-workout-clearance';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'Pre-Workout Clearance',
    description:
      'Brief readiness questionnaire (PAR-Q style) before starting personal training or group fitness.',
    formType: 'fitness_readiness',
    category: 'fitness',
    iconName: 'dumbbell',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Readiness questions', order: 0 },
        { id: s(2), title: 'Signature', order: 1 },
      ],
      fields: [
        { id: f(1), type: 'yes_no', sectionId: s(1), label: 'Has a doctor ever said you have a heart condition and should only do physical activity recommended by a doctor?', required: true, internalKey: 'heart_condition', order: 0 },
        { id: f(2), type: 'yes_no', sectionId: s(1), label: 'Do you feel pain in your chest when you do physical activity?', required: true, internalKey: 'chest_pain_activity', order: 1 },
        { id: f(3), type: 'yes_no', sectionId: s(1), label: 'In the past month, have you had chest pain when not doing physical activity?', required: true, internalKey: 'chest_pain_rest', order: 2 },
        { id: f(4), type: 'yes_no', sectionId: s(1), label: 'Do you lose your balance because of dizziness or do you ever lose consciousness?', required: true, internalKey: 'dizziness', order: 3 },
        { id: f(5), type: 'yes_no', sectionId: s(1), label: 'Do you have a bone or joint problem that could be made worse by exercise?', required: true, internalKey: 'bone_joint', order: 4 },
        { id: f(6), type: 'yes_no', sectionId: s(1), label: 'Is your doctor currently prescribing drugs for blood pressure or a heart condition?', required: true, internalKey: 'cardio_meds', order: 5 },
        { id: f(7), type: 'long_text', sectionId: s(1), label: 'Other reasons you should not do physical activity?', required: false, internalKey: 'other_reasons', order: 6 },
        { id: f(8), type: 'signature', sectionId: s(2), label: 'Signature', required: true, internalKey: 'signature', order: 0 },
      ],
    },
  };
}

// 13. Cancellation Policy Acknowledgment
function cancellationPolicyAckTemplate(): TemplateRecord {
  const slug = 'cancellation-policy-ack';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'Cancellation Policy Acknowledgment',
    description:
      'Confirms the client understands the cancellation, no-show, and late-arrival policy.',
    formType: 'cancellation_ack',
    category: 'general',
    iconName: 'calendar-x',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Acknowledgment', order: 0 },
      ],
      fields: [
        { id: f(1), type: 'checkbox', sectionId: s(1), label: 'I have read and understand the cancellation and no-show policy.', required: true, internalKey: 'policy_read_ack', order: 0 },
        { id: f(2), type: 'checkbox', sectionId: s(1), label: 'I understand cancellations within 24 hours and no-shows may be charged the full service fee.', required: true, internalKey: 'fee_ack', order: 1 },
        { id: f(3), type: 'signature', sectionId: s(1), label: 'Signature', required: true, internalKey: 'signature', order: 2 },
      ],
    },
  };
}

// 14. Post-Appointment Survey
function postAppointmentSurveyTemplate(): TemplateRecord {
  const slug = 'post-appointment-survey';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'Post-Appointment Survey',
    description:
      'Quick post-visit feedback covering overall rating, what stood out, and likelihood to recommend.',
    formType: 'custom',
    category: 'general',
    iconName: 'message-square',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Your visit', order: 0 },
      ],
      fields: [
        { id: f(1), type: 'rating', sectionId: s(1), label: 'How was your visit?', required: true, internalKey: 'overall_rating', order: 0, validation: { max: 5 } },
        { id: f(2), type: 'rating', sectionId: s(1), label: 'How would you rate your provider?', required: false, internalKey: 'provider_rating', order: 1, validation: { max: 5 } },
        { id: f(3), type: 'long_text', sectionId: s(1), label: 'What stood out (good or bad)?', required: false, internalKey: 'standout_feedback', order: 2 },
        { id: f(4), type: 'pain_scale', sectionId: s(1), label: 'How likely are you to recommend us? (0 = not at all, 10 = extremely)', required: false, internalKey: 'nps_score', order: 3 },
        { id: f(5), type: 'long_text', sectionId: s(1), label: 'Anything we could do better next time?', required: false, internalKey: 'improvement_feedback', order: 4 },
        { id: f(6), type: 'yes_no', sectionId: s(1), label: 'Okay to share your feedback publicly (with first name only)?', required: false, internalKey: 'public_share_ok', order: 5 },
      ],
    },
  };
}

// 15. Membership Agreement
function membershipAgreementTemplate(): TemplateRecord {
  const slug = 'membership-agreement';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'Membership Agreement',
    description:
      'Captures member commitment to a recurring plan including billing cadence and cancellation terms.',
    formType: 'membership_agreement',
    category: 'general',
    iconName: 'badge-check',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Plan details', order: 0 },
        { id: s(2), title: 'Commitment and acknowledgments', order: 1 },
        { id: s(3), title: 'Signature', order: 2 },
      ],
      fields: [
        { id: f(1), type: 'short_text', sectionId: s(1), label: 'Plan name', required: true, internalKey: 'plan_name', order: 0 },
        { id: f(2), type: 'radio', sectionId: s(1), label: 'Billing cadence', required: true, internalKey: 'billing_cadence', order: 1, options: [
          { value: 'monthly', label: 'Monthly' },
          { value: 'quarterly', label: 'Quarterly' },
          { value: 'annual', label: 'Annual' },
        ] },
        { id: f(3), type: 'date', sectionId: s(1), label: 'Start date', required: true, internalKey: 'start_date', order: 2 },
        { id: f(4), type: 'checkbox', sectionId: s(2), label: 'I authorize recurring charges to my payment method on file.', required: true, internalKey: 'recurring_charge_ack', order: 0 },
        { id: f(5), type: 'checkbox', sectionId: s(2), label: 'I understand the cancellation policy (30-day written notice).', required: true, internalKey: 'cancellation_terms_ack', order: 1 },
        { id: f(6), type: 'checkbox', sectionId: s(2), label: 'I understand membership benefits do not roll over month to month unless explicitly stated.', required: true, internalKey: 'no_rollover_ack', order: 2 },
        { id: f(7), type: 'short_text', sectionId: s(3), label: 'Full legal name', required: true, internalKey: 'full_legal_name', order: 0 },
        { id: f(8), type: 'signature', sectionId: s(3), label: 'Signature', required: true, internalKey: 'signature', order: 1 },
      ],
    },
  };
}

// 16. Package Agreement
function packageAgreementTemplate(): TemplateRecord {
  const slug = 'package-agreement';
  const s = (n: number) => sid(slug, 'section', n);
  const f = (n: number) => sid(slug, 'field', n);
  return {
    slug,
    title: 'Package Agreement',
    description:
      'Captures terms of a pre-paid service package, including session count, expiration, and refund policy.',
    formType: 'membership_agreement',
    category: 'general',
    iconName: 'package',
    schema: {
      schemaVersion: 2,
      sections: [
        { id: s(1), title: 'Package details', order: 0 },
        { id: s(2), title: 'Acknowledgments and signature', order: 1 },
      ],
      fields: [
        { id: f(1), type: 'short_text', sectionId: s(1), label: 'Package name', required: true, internalKey: 'package_name', order: 0 },
        { id: f(2), type: 'number', sectionId: s(1), label: 'Number of sessions', required: true, internalKey: 'session_count', order: 1 },
        { id: f(3), type: 'date', sectionId: s(1), label: 'Expiration date', required: true, internalKey: 'expiration_date', order: 2 },
        { id: f(4), type: 'checkbox', sectionId: s(2), label: 'I understand sessions expire on the date above and unused sessions are forfeit.', required: true, internalKey: 'expiration_ack', order: 0 },
        { id: f(5), type: 'checkbox', sectionId: s(2), label: 'I understand packages are non-refundable but may be transferred with provider approval.', required: true, internalKey: 'refund_policy_ack', order: 1 },
        { id: f(6), type: 'signature', sectionId: s(2), label: 'Signature', required: true, internalKey: 'signature', order: 2 },
      ],
    },
  };
}

const TEMPLATES: TemplateRecord[] = [
  generalIntakeTemplate(),
  massageIntakeTemplate(),
  medspaIntakeTemplate(),
  medicalHistoryTemplate(),
  injuryHistoryTemplate(),
  generalLiabilityWaiverTemplate(),
  waxingConsentTemplate(),
  botoxFillerConsentTemplate(),
  chemicalPeelConsentTemplate(),
  microneedlingConsentTemplate(),
  covidScreeningTemplate(),
  preWorkoutClearanceTemplate(),
  cancellationPolicyAckTemplate(),
  postAppointmentSurveyTemplate(),
  membershipAgreementTemplate(),
  packageAgreementTemplate(),
];

// ---------- Seeder ----------

export async function seedFormTemplates(prisma: PrismaClient): Promise<void> {
  for (const t of TEMPLATES) {
    await prisma.formTemplate.upsert({
      where: { slug: t.slug },
      create: {
        slug: t.slug,
        title: t.title,
        description: t.description,
        formType: t.formType,
        category: t.category,
        iconName: t.iconName,
        schema: t.schema as unknown as object,
      },
      update: {
        title: t.title,
        description: t.description,
        formType: t.formType,
        category: t.category,
        iconName: t.iconName,
        schema: t.schema as unknown as object,
      },
    });
  }
  console.log(`Seeded ${TEMPLATES.length} form templates.`);
}
