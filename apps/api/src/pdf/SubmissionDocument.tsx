// Forms System PR 12 — server-rendered PDF document for a submitted form.
//
// Rendered via @react-pdf/renderer (Node-side React) by formPdfService.
// No headless Chromium — react-pdf walks this JSX tree and emits PDF bytes
// directly via PDFKit under the hood.
//
// Scope decisions (per PR 12 spec):
//   - Header is text-only. Logo embedding (MediaAsset → R2 signed URL →
//     fetch → base64) waits on the R2 signed-URL plumbing that gates other
//     PR 12 features. TODO(epic-11) flags the spot.
//   - File-upload fields render a "(file uploaded — view in admin)"
//     placeholder. Same R2 gate.
//   - Signature renders once at the bottom in a dedicated block; the field
//     row itself just notes "see signature block below".
//   - Hidden fields (per visibility rules) are skipped entirely so the PDF
//     matches what the client saw / answered.

import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import {
  coerceSchema,
  isFieldVisible,
  type FormFieldShape,
  type FormSchemaShape,
} from '../lib/formValidation.js';

// ---------- Public props ----------

export interface SignatureData {
  imageBase64?: string;
  typedSignature?: string;
  signedAt?: string;
  ip?: string;
  userAgent?: string;
  formVersion?: number;
}

export interface SubmissionDocumentProps {
  tenantName: string;
  /** Optional accent color (hex like "#3B5B4E"). Falls back to sage default. */
  tenantBrandAccentHex: string | null;
  submission: {
    id: string;
    status: string;
    submittedAt: string | null;
    signatureData: SignatureData | null;
  };
  definition: {
    title: string;
    description: string | null;
    formType: string | null;
    version: number;
    /** Normalized via coerceSchema before rendering. */
    schemaRaw: unknown;
  };
  answers: Record<string, unknown>;
  client: {
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  appointment: {
    scheduledStartAt: string | null;
    serviceName: string | null;
  } | null;
  generatedAt: Date;
}

// ---------- Styles ----------

const COLORS = {
  ink: '#1F2421',
  inkSoft: '#5A6660',
  border: '#D9DBD7',
  accentDefault: '#3B5B4E', // sage-deep token approximation
  surfaceSubtle: '#F4F1EC',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingLeft: 48,
    paddingRight: 48,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: COLORS.ink,
    lineHeight: 1.4,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 8,
    marginBottom: 18,
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: COLORS.accentDefault,
  },
  tenantName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    color: COLORS.ink,
  },
  headerMeta: {
    fontSize: 9,
    color: COLORS.inkSoft,
  },
  formTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    marginBottom: 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 18,
  },
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceSubtle,
    fontSize: 9,
    color: COLORS.inkSoft,
  },
  contextBlock: {
    flexDirection: 'row',
    gap: 24,
    paddingTop: 8,
    paddingBottom: 12,
    marginBottom: 18,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: COLORS.border,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: COLORS.border,
  },
  contextColumn: {
    flex: 1,
  },
  contextLabel: {
    fontSize: 8,
    color: COLORS.inkSoft,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  contextValue: {
    fontSize: 10,
    color: COLORS.ink,
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    marginTop: 10,
    marginBottom: 6,
    paddingBottom: 2,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: COLORS.border,
  },
  sectionDescription: {
    fontSize: 9,
    color: COLORS.inkSoft,
    marginBottom: 8,
    marginTop: -2,
  },
  fieldBlock: {
    marginBottom: 10,
  },
  fieldLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: COLORS.ink,
    marginBottom: 2,
  },
  fieldAnswer: {
    fontSize: 10,
    color: COLORS.ink,
  },
  fieldAnswerMuted: {
    fontSize: 10,
    color: COLORS.inkSoft,
    fontStyle: 'italic',
  },
  signatureBlock: {
    marginTop: 24,
    padding: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceSubtle,
  },
  signatureHeading: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    marginBottom: 6,
  },
  signatureImage: {
    width: 220,
    height: 90,
    marginVertical: 4,
  },
  signatureTyped: {
    fontFamily: 'Helvetica-Oblique',
    fontSize: 16,
    marginVertical: 4,
  },
  signatureAuditRow: {
    fontSize: 8,
    color: COLORS.inkSoft,
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    fontSize: 8,
    color: COLORS.inkSoft,
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: COLORS.border,
    paddingTop: 6,
  },
});

// ---------- Formatting helpers ----------

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // ISO date string ("YYYY-MM-DD") — render without timezone shift.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-');
    if (y && m && d) {
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  }
  return formatDateTime(iso);
}

function clientFullName(
  client: SubmissionDocumentProps['client'],
): string {
  if (!client) return '—';
  const parts = [client.firstName, client.lastName].filter(
    (p): p is string => typeof p === 'string' && p.length > 0,
  );
  return parts.length > 0 ? parts.join(' ') : '—';
}

function isValidHex(s: string | null): s is string {
  return typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
}

// ---------- Per-type answer rendering ----------

function renderYesNo(value: unknown): string {
  if (value === true || value === 'yes') return 'Yes';
  if (value === false || value === 'no') return 'No';
  return '—';
}

function renderCheckbox(value: unknown): string {
  return value === true ? 'Checked' : 'Not checked';
}

function renderOptionLabel(
  field: FormFieldShape,
  value: unknown,
): string {
  if (typeof value !== 'string' || value.length === 0) return '—';
  const opt = (field.options ?? []).find((o) => o.value === value);
  return opt?.label ?? value;
}

function renderMultiSelect(
  field: FormFieldShape,
  value: unknown,
): string {
  if (!Array.isArray(value) || value.length === 0) return '—';
  const labels: string[] = [];
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const opt = (field.options ?? []).find((o) => o.value === v);
    labels.push(opt?.label ?? v);
  }
  return labels.length > 0 ? labels.join(', ') : '—';
}

function renderRating(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return '—';
  // Filled / hollow star unicode reads cleanly in Helvetica.
  const filled = Math.max(0, Math.min(5, Math.round(n)));
  return `${filled} out of 5`;
}

function renderPainScale(value: unknown): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return '—';
  const clamped = Math.max(0, Math.min(10, Math.round(n)));
  return `${clamped} out of 10`;
}

function renderTextish(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') {
    return value.trim().length > 0 ? value : '—';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '—';
}

// Returns the rendered text + whether the answer is "muted" (empty / placeholder).
function answerForField(
  field: FormFieldShape,
  value: unknown,
): { text: string; muted: boolean } {
  switch (field.type) {
    case 'yes_no': {
      const rendered = renderYesNo(value);
      return { text: rendered, muted: rendered === '—' };
    }
    case 'checkbox':
      return { text: renderCheckbox(value), muted: false };
    case 'multi_select': {
      const rendered = renderMultiSelect(field, value);
      return { text: rendered, muted: rendered === '—' };
    }
    case 'dropdown':
    case 'radio': {
      const rendered = renderOptionLabel(field, value);
      return { text: rendered, muted: rendered === '—' };
    }
    case 'rating': {
      const rendered = renderRating(value);
      return { text: rendered, muted: rendered === '—' };
    }
    case 'pain_scale': {
      const rendered = renderPainScale(value);
      return { text: rendered, muted: rendered === '—' };
    }
    case 'date': {
      const rendered = typeof value === 'string' ? formatDate(value) : '—';
      return { text: rendered, muted: rendered === '—' };
    }
    case 'signature':
      return { text: '(see signature block below)', muted: true };
    case 'file_upload':
    case 'image_upload': {
      // Per PR 12: file embedding deferred until R2 signed-URL plumbing
      // lands (see TODO(epic-11) at the file head).
      const obj = value as { mediaAssetId?: unknown } | null | undefined;
      const has =
        obj && typeof obj === 'object' && typeof obj.mediaAssetId === 'string';
      return {
        text: has
          ? '(file uploaded — view in admin)'
          : '(no file uploaded)',
        muted: true,
      };
    }
    default: {
      const rendered = renderTextish(value);
      return { text: rendered, muted: rendered === '—' };
    }
  }
}

// ---------- Field iteration ----------

interface RenderableField {
  field: FormFieldShape;
}

interface RenderableGroup {
  /** null = "General" (top-level fields). */
  sectionId: string | null;
  title: string | null;
  description: string | null;
  fields: RenderableField[];
}

function groupFieldsForRender(
  schema: FormSchemaShape,
  answers: Record<string, unknown>,
): RenderableGroup[] {
  const fields = Array.isArray(schema.fields) ? schema.fields : [];
  const visibleFields = fields.filter((f) => isFieldVisible(f, answers, fields));

  const sectionMap = new Map<string, RenderableGroup>();
  const topLevel: RenderableGroup = {
    sectionId: null,
    title: null,
    description: null,
    fields: [],
  };

  for (const section of schema.sections ?? []) {
    sectionMap.set(section.id, {
      sectionId: section.id,
      title: section.title || 'Untitled section',
      description:
        'description' in section &&
        typeof (section as { description?: unknown }).description === 'string'
          ? ((section as { description: string }).description || null)
          : null,
      fields: [],
    });
  }

  // Honor field.order within each group (visibleFields already came from
  // the canonical order in `fields`, but field.order can override).
  const sortedVisible = visibleFields
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const f of sortedVisible) {
    if (f.sectionId && sectionMap.has(f.sectionId)) {
      sectionMap.get(f.sectionId)!.fields.push({ field: f });
    } else {
      topLevel.fields.push({ field: f });
    }
  }

  const orderedSectionGroups = (schema.sections ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s) => sectionMap.get(s.id)!)
    .filter((g): g is RenderableGroup => Boolean(g));

  // Synthesize a "General" header only when there are top-level fields AND
  // there's at least one explicit section — otherwise the top-level fields
  // render flush against the form-meta block with no extra header.
  const groups: RenderableGroup[] = [];
  if (topLevel.fields.length > 0) {
    if (orderedSectionGroups.length > 0) {
      groups.push({ ...topLevel, title: 'General' });
    } else {
      groups.push(topLevel);
    }
  }
  groups.push(...orderedSectionGroups);
  return groups;
}

// ---------- Section / field renderers ----------

function FieldRow({
  field,
  answers,
}: {
  field: FormFieldShape;
  answers: Record<string, unknown>;
}) {
  const { text, muted } = answerForField(field, answers[field.id]);
  return (
    <View style={styles.fieldBlock} wrap={false}>
      <Text style={styles.fieldLabel}>{field.label}</Text>
      <Text style={muted ? styles.fieldAnswerMuted : styles.fieldAnswer}>
        {text}
      </Text>
    </View>
  );
}

function SectionBlock({
  group,
  answers,
}: {
  group: RenderableGroup;
  answers: Record<string, unknown>;
}) {
  return (
    <View>
      {group.title ? (
        <Text style={styles.sectionTitle}>{group.title}</Text>
      ) : null}
      {group.description ? (
        <Text style={styles.sectionDescription}>{group.description}</Text>
      ) : null}
      {group.fields.length === 0 ? (
        <Text style={styles.fieldAnswerMuted}>
          (No answers in this section.)
        </Text>
      ) : (
        group.fields.map((rf) => (
          <FieldRow
            key={rf.field.id}
            field={rf.field}
            answers={answers}
          />
        ))
      )}
    </View>
  );
}

function SignatureBlock({
  signatureData,
  formVersion,
}: {
  signatureData: SignatureData;
  formVersion: number;
}) {
  const hasImage =
    typeof signatureData.imageBase64 === 'string' &&
    signatureData.imageBase64.length > 0;
  const hasTyped =
    typeof signatureData.typedSignature === 'string' &&
    signatureData.typedSignature.trim().length > 0;
  if (!hasImage && !hasTyped) return null;

  // imageBase64 is the FULL data URL (data:image/png;base64,...) — the
  // signature pad writes it via canvas.toDataURL('image/png'). @react-pdf's
  // Image src accepts data URLs directly, so no string surgery needed here.
  return (
    <View style={styles.signatureBlock} wrap={false}>
      <Text style={styles.signatureHeading}>Signature</Text>
      {hasImage ? (
        <Image
          src={signatureData.imageBase64 as string}
          style={styles.signatureImage}
        />
      ) : null}
      {!hasImage && hasTyped ? (
        <Text style={styles.signatureTyped}>
          {signatureData.typedSignature}
        </Text>
      ) : null}
      <Text style={styles.signatureAuditRow}>
        Signed at: {formatDateTime(signatureData.signedAt)}
      </Text>
      {signatureData.ip ? (
        <Text style={styles.signatureAuditRow}>IP: {signatureData.ip}</Text>
      ) : null}
      {signatureData.userAgent ? (
        <Text style={styles.signatureAuditRow}>
          User agent: {signatureData.userAgent}
        </Text>
      ) : null}
      <Text style={styles.signatureAuditRow}>
        Form version: v{signatureData.formVersion ?? formVersion}
      </Text>
    </View>
  );
}

// ---------- Document ----------

export function SubmissionDocument(props: SubmissionDocumentProps) {
  const schema = coerceSchema(props.definition.schemaRaw);
  const groups = groupFieldsForRender(schema, props.answers);
  const accent = isValidHex(props.tenantBrandAccentHex)
    ? props.tenantBrandAccentHex
    : COLORS.accentDefault;

  const formTypeLabel = props.definition.formType
    ? props.definition.formType
        .split('_')
        .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
        .join(' ')
    : null;

  const submittedAtFormatted = formatDateTime(props.submission.submittedAt);
  const generatedAtFormatted = formatDateTime(props.generatedAt.toISOString());

  const signatureBlob = props.submission.signatureData;
  const signatureToRender =
    signatureBlob &&
    typeof signatureBlob === 'object' &&
    (typeof signatureBlob.imageBase64 === 'string' ||
      typeof signatureBlob.typedSignature === 'string')
      ? signatureBlob
      : null;

  return (
    <Document
      title={`${props.definition.title} — ${clientFullName(props.client)}`}
      author={props.tenantName}
    >
      <Page size="LETTER" style={styles.page}>
        {/* TODO(epic-11): embed tenant logo once R2 signed-URL plumbing
            is wired — pull MediaAsset, presign the URL, fetch the bytes,
            base64-encode, and place an <Image> next to .tenantName. */}
        <View
          style={[
            styles.headerBar,
            { borderBottomColor: accent },
          ]}
        >
          <View>
            <Text style={styles.tenantName}>{props.tenantName}</Text>
          </View>
          <View>
            <Text style={styles.headerMeta}>
              Submitted {submittedAtFormatted}
            </Text>
          </View>
        </View>

        <Text style={styles.formTitle}>{props.definition.title}</Text>
        <View style={styles.pillRow}>
          <Text style={styles.pill}>v{props.definition.version}</Text>
          {formTypeLabel ? (
            <Text style={styles.pill}>{formTypeLabel}</Text>
          ) : null}
        </View>

        <View style={styles.contextBlock}>
          <View style={styles.contextColumn}>
            <Text style={styles.contextLabel}>Client</Text>
            <Text style={styles.contextValue}>
              {clientFullName(props.client)}
            </Text>
            {props.client?.email ? (
              <Text style={styles.contextValue}>{props.client.email}</Text>
            ) : null}
            {props.client?.phone ? (
              <Text style={styles.contextValue}>{props.client.phone}</Text>
            ) : null}
          </View>
          <View style={styles.contextColumn}>
            <Text style={styles.contextLabel}>Appointment</Text>
            {props.appointment?.serviceName ? (
              <Text style={styles.contextValue}>
                {props.appointment.serviceName}
              </Text>
            ) : (
              <Text style={styles.fieldAnswerMuted}>—</Text>
            )}
            {props.appointment?.scheduledStartAt ? (
              <Text style={styles.contextValue}>
                {formatDateTime(props.appointment.scheduledStartAt)}
              </Text>
            ) : null}
          </View>
        </View>

        {groups.length === 0 ? (
          <Text style={styles.fieldAnswerMuted}>
            This form has no questions.
          </Text>
        ) : (
          groups.map((g) => (
            <SectionBlock
              key={g.sectionId ?? '__top'}
              group={g}
              answers={props.answers}
            />
          ))
        )}

        {signatureToRender ? (
          <SignatureBlock
            signatureData={signatureToRender}
            formVersion={props.definition.version}
          />
        ) : null}

        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `Generated by Wellos — ${generatedAtFormatted}  ·  Page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}
