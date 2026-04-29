'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import type { ClientWriteBody, ClientIntakeStatus } from '@/lib/api/clients';

import type { ActionState } from './_actions';

const INTAKE_STATUS_LABELS: Record<ClientIntakeStatus, string> = {
  pending: 'Pending',
  sent: 'Sent',
  completed: 'Completed',
  expired: 'Expired',
};

const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  border: '1px solid #ccc',
  borderRadius: '4px',
  fontSize: '0.95rem',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  fontSize: '0.9rem',
  color: '#333',
};

const errorTextStyle: React.CSSProperties = {
  color: '#c33',
  fontSize: '0.85rem',
  marginTop: '0.25rem',
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span style={errorTextStyle}>{message}</span>;
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        padding: '0.6rem 1.25rem',
        background: pending ? '#888' : '#111',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        fontSize: '0.95rem',
        cursor: pending ? 'wait' : 'pointer',
      }}
    >
      {pending ? 'Saving…' : label}
    </button>
  );
}

type Props = {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial?: Partial<ClientWriteBody>;
  submitLabel?: string;
  successMessage?: string;
};

export function ClientForm({
  action,
  initial,
  submitLabel = 'Save',
  successMessage = 'Saved.',
}: Props) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, { ok: false });

  // After the action returns with a duplicate warning, re-display the values
  // the user submitted. After success, fall back to the action's echoed
  // values so updated form reflects what was just saved.
  const values = state.values ?? initial ?? {};
  const fieldErrors = state.fieldErrors ?? {};
  const showAcknowledge = Boolean(state.duplicateWarning);

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '720px' }}>
      {state.ok && (
        <div
          role="status"
          style={{
            padding: '0.75rem',
            background: '#e8f5e9',
            border: '1px solid #66bb6a',
            borderRadius: '4px',
            color: '#1b5e20',
          }}
        >
          {successMessage}
        </div>
      )}

      {state.error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem',
            background: '#fee',
            border: '1px solid #c33',
            borderRadius: '4px',
            color: '#900',
          }}
        >
          {state.error}
          {state.duplicateWarning && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
              {state.duplicateWarning.matchedByEmail > 0 && (
                <div>· {state.duplicateWarning.matchedByEmail} match by email</div>
              )}
              {state.duplicateWarning.matchedByPhone > 0 && (
                <div>· {state.duplicateWarning.matchedByPhone} match by phone</div>
              )}
              <div style={{ marginTop: '0.5rem' }}>
                Save anyway? Click <strong>{submitLabel}</strong> again — duplicates will be allowed.
              </div>
            </div>
          )}
        </div>
      )}

      {showAcknowledge && (
        <input type="hidden" name="acknowledgeDuplicate" value="1" />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <label style={labelStyle}>
          First name *
          <input
            type="text"
            name="firstName"
            required
            defaultValue={values.firstName ?? ''}
            style={inputStyle}
          />
          <FieldError message={fieldErrors.firstName} />
        </label>
        <label style={labelStyle}>
          Last name
          <input
            type="text"
            name="lastName"
            defaultValue={values.lastName ?? ''}
            style={inputStyle}
          />
          <FieldError message={fieldErrors.lastName} />
        </label>
        <label style={labelStyle}>
          Email
          <input
            type="email"
            name="email"
            defaultValue={values.email ?? ''}
            style={inputStyle}
          />
          <FieldError message={fieldErrors.email} />
        </label>
        <label style={labelStyle}>
          Phone
          <input
            type="tel"
            name="phone"
            defaultValue={values.phone ?? ''}
            style={inputStyle}
          />
          <FieldError message={fieldErrors.phone} />
        </label>
        <label style={labelStyle}>
          Date of birth
          <input
            type="date"
            name="dateOfBirth"
            defaultValue={values.dateOfBirth ?? ''}
            style={inputStyle}
          />
          <FieldError message={fieldErrors.dateOfBirth} />
        </label>
        <label style={labelStyle}>
          Intake status
          <select
            name="intakeStatus"
            defaultValue={values.intakeStatus ?? 'pending'}
            style={inputStyle}
          >
            {(Object.keys(INTAKE_STATUS_LABELS) as ClientIntakeStatus[]).map((s) => (
              <option key={s} value={s}>
                {INTAKE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <FieldError message={fieldErrors.intakeStatus} />
        </label>
      </div>

      <fieldset style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: '4px' }}>
        <legend style={{ padding: '0 0.5rem', color: '#444' }}>Address</legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={labelStyle}>
            Line 1
            <input type="text" name="addressLine1" defaultValue={values.addressLine1 ?? ''} style={inputStyle} />
            <FieldError message={fieldErrors.addressLine1} />
          </label>
          <label style={labelStyle}>
            Line 2
            <input type="text" name="addressLine2" defaultValue={values.addressLine2 ?? ''} style={inputStyle} />
            <FieldError message={fieldErrors.addressLine2} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem' }}>
            <label style={labelStyle}>
              City
              <input type="text" name="city" defaultValue={values.city ?? ''} style={inputStyle} />
              <FieldError message={fieldErrors.city} />
            </label>
            <label style={labelStyle}>
              State
              <input type="text" name="state" defaultValue={values.state ?? ''} style={inputStyle} />
              <FieldError message={fieldErrors.state} />
            </label>
            <label style={labelStyle}>
              Postal code
              <input type="text" name="postalCode" defaultValue={values.postalCode ?? ''} style={inputStyle} />
              <FieldError message={fieldErrors.postalCode} />
            </label>
          </div>
          <label style={labelStyle}>
            Country
            <input type="text" name="country" defaultValue={values.country ?? ''} style={inputStyle} />
            <FieldError message={fieldErrors.country} />
          </label>
        </div>
      </fieldset>

      <fieldset style={{ border: '1px solid #ddd', padding: '1rem', borderRadius: '4px' }}>
        <legend style={{ padding: '0 0.5rem', color: '#444' }}>Emergency contact</legend>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <label style={labelStyle}>
            Name
            <input
              type="text"
              name="emergencyContactName"
              defaultValue={values.emergencyContactName ?? ''}
              style={inputStyle}
            />
            <FieldError message={fieldErrors.emergencyContactName} />
          </label>
          <label style={labelStyle}>
            Phone
            <input
              type="tel"
              name="emergencyContactPhone"
              defaultValue={values.emergencyContactPhone ?? ''}
              style={inputStyle}
            />
            <FieldError message={fieldErrors.emergencyContactPhone} />
          </label>
        </div>
      </fieldset>

      <label style={labelStyle}>
        Notes
        <textarea
          name="notes"
          rows={4}
          defaultValue={values.notes ?? ''}
          style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
        />
        <FieldError message={fieldErrors.notes} />
      </label>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
