'use client';

// Geofence editor body (PR 7 of the Geofence Auto Check-in epic). Owns the
// interactive state for the map + sliders + toggle, and submits via the
// updateGeofenceAction server action. Wraps Leaflet behind a dynamic import
// (ssr: false) — Leaflet touches `window` at module scope and would crash SSR.
//
// React 18: useFormState / useFormStatus from 'react-dom'. NEVER useActionState
// from 'react' — that's React 19 only and the ESLint rule blocks the wrong
// import. See feedback_react18_useformstate.md.

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { Alert, Button, FormField } from '@/components/ui';
import type { LocationGeofence } from '@/lib/api/location-geofence';
import type { WhoamiLocation } from '@/lib/api/whoami';
import { cn } from '@/lib/cn';

import { LocationSelector } from './LocationSelector';
import { UseCurrentLocationButton } from './UseCurrentLocationButton';
import { INITIAL_GEOFENCE_STATE, type UpdateGeofenceState } from './_types';

// Schema defaults — mirror the API's Zod schema. When no geofence exists,
// these seed the form so saving creates a sensible starting config.
const DEFAULT_RADIUS_METERS = 50;
const DEFAULT_BEFORE_MINUTES = 15;
const DEFAULT_AFTER_MINUTES = 5;

// Lat/lng precision: 6 decimal places ≈ 0.11 m. Plenty for studios; keeps
// the rendered text from looking noisy.
const COORD_DECIMALS = 6;

// Leaflet container must be client-only — dynamic import with ssr: false.
const LocationGeofenceMap = dynamic(() => import('./LocationGeofenceMap'), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center rounded-md border border-line bg-surface-2 t-body-sm text-ink-3"
      style={{ height: 480 }}
    >
      Loading map…
    </div>
  ),
});

type Props = {
  locations: WhoamiLocation[];
  selectedLocation: WhoamiLocation;
  initialGeofence: LocationGeofence | null;
  updateAction: (
    prev: UpdateGeofenceState,
    formData: FormData,
  ) => Promise<UpdateGeofenceState>;
  deleteAction: (
    prev: UpdateGeofenceState,
    formData: FormData,
  ) => Promise<UpdateGeofenceState>;
};

// Internal form values — strings would make slider wiring awkward; we keep
// numbers in React state and stringify into hidden inputs on submit.
type EditorValues = {
  center: { lat: number; lng: number } | null;
  radiusMeters: number;
  checkInWindowBeforeMinutes: number;
  checkInWindowAfterMinutes: number;
  enabled: boolean;
};

function geofenceToValues(g: LocationGeofence): EditorValues {
  return {
    center: { lat: g.centerLat, lng: g.centerLng },
    radiusMeters: g.radiusMeters,
    checkInWindowBeforeMinutes: g.checkInWindowBeforeMinutes,
    checkInWindowAfterMinutes: g.checkInWindowAfterMinutes,
    enabled: g.enabled,
  };
}

function emptyValues(): EditorValues {
  return {
    center: null,
    radiusMeters: DEFAULT_RADIUS_METERS,
    checkInWindowBeforeMinutes: DEFAULT_BEFORE_MINUTES,
    checkInWindowAfterMinutes: DEFAULT_AFTER_MINUTES,
    enabled: true,
  };
}

function valuesEqual(a: EditorValues, b: EditorValues): boolean {
  const aCenter = a.center;
  const bCenter = b.center;
  if (aCenter === null && bCenter === null) {
    // Both empty — equal only when the rest of the fields also match (we
    // don't gate by center alone). Continue to the field comparison.
  } else if (aCenter === null || bCenter === null) {
    return false;
  } else if (
    aCenter.lat !== bCenter.lat ||
    aCenter.lng !== bCenter.lng
  ) {
    return false;
  }
  return (
    a.radiusMeters === b.radiusMeters &&
    a.checkInWindowBeforeMinutes === b.checkInWindowBeforeMinutes &&
    a.checkInWindowAfterMinutes === b.checkInWindowAfterMinutes &&
    a.enabled === b.enabled
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="primary"
      size="md"
      loading={pending}
      disabled={disabled || pending}
    >
      {pending ? 'Saving…' : 'Save geofence'}
    </Button>
  );
}

function DeleteButton({ onConfirm }: { onConfirm: () => void }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      size="md"
      loading={pending}
      disabled={pending}
      className="text-red hover:bg-red-pale"
      onClick={(e) => {
        if (
          !window.confirm(
            "Delete the geofence for this location? Clients won't be able to auto check-in.",
          )
        ) {
          e.preventDefault();
        } else {
          onConfirm();
        }
      }}
    >
      {pending ? 'Deleting…' : 'Delete geofence'}
    </Button>
  );
}

export function GeofenceEditorBody({
  locations,
  selectedLocation,
  initialGeofence,
  updateAction,
  deleteAction,
}: Props) {
  const initialValues = useMemo(
    () => (initialGeofence ? geofenceToValues(initialGeofence) : emptyValues()),
    [initialGeofence],
  );

  const [values, setValues] = useState<EditorValues>(initialValues);

  // When the user switches locations, the page server-component re-renders
  // and we receive a new initialGeofence prop. Reset local state so the
  // editor reflects the new selection.
  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  const [updateState, updateFormAction] = useFormState<
    UpdateGeofenceState,
    FormData
  >(updateAction, INITIAL_GEOFENCE_STATE);
  const [deleteState, deleteFormAction] = useFormState<
    UpdateGeofenceState,
    FormData
  >(deleteAction, INITIAL_GEOFENCE_STATE);

  // The "Save" gate is twofold:
  //   • No center picked yet → can't save (the API requires lat/lng).
  //   • No changes vs. initial → nothing to save.
  const isDirty = !valuesEqual(values, initialValues);
  const canSave = values.center !== null && isDirty;

  const updateCenter = useCallback((lat: number, lng: number) => {
    setValues((v) => ({ ...v, center: { lat, lng } }));
  }, []);

  const fieldErrors = updateState.fieldErrors ?? {};

  return (
    <div className="flex flex-col gap-s6">
      <header className="flex flex-col gap-s1">
        <span className="t-eyebrow text-sage">STUDIO LOCATIONS</span>
        <h1 className="t-display-lg">Geofence auto check-in</h1>
        <p className="t-body-md text-ink-soft">
          Set the GPS boundaries where clients can auto check-in for their
          classes. Save changes to apply.
        </p>
      </header>

      <div className="max-w-sm">
        <LocationSelector
          locations={locations}
          selectedLocationId={selectedLocation.id}
        />
      </div>

      {updateState.status === 'success' && (
        <Alert tone="success">
          {updateState.message ?? 'Geofence saved.'}
        </Alert>
      )}
      {updateState.status === 'error' && updateState.message && (
        <Alert tone="error">{updateState.message}</Alert>
      )}
      {deleteState.status === 'success' && (
        <Alert tone="success">
          {deleteState.message ?? 'Geofence removed.'}
        </Alert>
      )}
      {deleteState.status === 'error' && deleteState.message && (
        <Alert tone="error">{deleteState.message}</Alert>
      )}

      <div className="grid grid-cols-1 gap-s6 lg:grid-cols-2">
        {/* LEFT — Map + "Use current location" */}
        <div className="flex flex-col gap-s4">
          {values.center ? (
            <LocationGeofenceMap
              center={values.center}
              radiusMeters={values.radiusMeters}
              onCenterChange={updateCenter}
              interactive
            />
          ) : (
            <div
              className={cn(
                'flex flex-col items-center justify-center gap-s2 rounded-md',
                'border-2 border-dashed border-line-strong bg-surface-2 p-s6 text-center',
              )}
              style={{ height: 480 }}
            >
              <div className="font-display text-[18px] text-ink">
                No geofence set for this location yet
              </div>
              <p className="t-body-sm text-ink-3">
                Click &ldquo;Use current location&rdquo; below to set the center
                to where you are now, or pick coordinates manually after the map
                loads.
              </p>
            </div>
          )}

          <UseCurrentLocationButton
            onLocationFound={updateCenter}
            disabled={false}
          />
        </div>

        {/* RIGHT — controls */}
        <div className="flex flex-col gap-s5">
          <h2 id="geofence-config-heading" className="t-display-sm">
            Configuration
          </h2>

          {/* Save form. The button sits at the bottom but lives in this form
              so the hidden inputs (state snapshot) submit with it. The Delete
              form is a sibling below to avoid invalid nested forms. */}
          <form
            id="geofence-save-form"
            action={updateFormAction}
            className="flex flex-col gap-s5"
            aria-labelledby="geofence-config-heading"
          >
            {/* Hidden inputs carry the React state to the server action. */}
            <input
              type="hidden"
              name="locationId"
              value={selectedLocation.id}
            />
            <input
              type="hidden"
              name="centerLat"
              value={values.center?.lat ?? ''}
            />
            <input
              type="hidden"
              name="centerLng"
              value={values.center?.lng ?? ''}
            />
            <input
              type="hidden"
              name="radiusMeters"
              value={values.radiusMeters}
            />
            <input
              type="hidden"
              name="checkInWindowBeforeMinutes"
              value={values.checkInWindowBeforeMinutes}
            />
            <input
              type="hidden"
              name="checkInWindowAfterMinutes"
              value={values.checkInWindowAfterMinutes}
            />
            {values.enabled && (
              <input type="hidden" name="enabled" value="1" />
            )}

          <FormField
            label="Coordinates"
            hint="Drag the marker or click the map to update."
            error={fieldErrors.centerLat ?? fieldErrors.centerLng}
          >
            <div
              className={cn(
                'rounded-md border border-line bg-surface-2 px-s4 py-[13px]',
                't-body-md font-mono tabular-nums text-ink',
              )}
              aria-readonly="true"
            >
              {values.center ? (
                <>
                  {values.center.lat.toFixed(COORD_DECIMALS)},{' '}
                  {values.center.lng.toFixed(COORD_DECIMALS)}
                </>
              ) : (
                <span className="text-ink-3">— Not set —</span>
              )}
            </div>
          </FormField>

          <FormField
            label={`Radius — ${values.radiusMeters} m`}
            hint="Tight (25 m) = studio interior. Wide (200 m) = large complex."
            error={fieldErrors.radiusMeters}
          >
            <input
              type="range"
              min={25}
              max={200}
              step={5}
              value={values.radiusMeters}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  radiusMeters: Number(e.target.value),
                }))
              }
              className="w-full cursor-pointer accent-accent"
              aria-valuemin={25}
              aria-valuemax={200}
              aria-valuenow={values.radiusMeters}
            />
          </FormField>

          <FormField
            label={`Check-in window — ${values.checkInWindowBeforeMinutes} min before class`}
            hint="Earliest auto check-in fires this many minutes before scheduled start."
            error={fieldErrors.checkInWindowBeforeMinutes}
          >
            <input
              type="range"
              min={0}
              max={60}
              step={1}
              value={values.checkInWindowBeforeMinutes}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  checkInWindowBeforeMinutes: Number(e.target.value),
                }))
              }
              className="w-full cursor-pointer accent-accent"
              aria-valuemin={0}
              aria-valuemax={60}
              aria-valuenow={values.checkInWindowBeforeMinutes}
            />
          </FormField>

          <FormField
            label={`Late grace — ${values.checkInWindowAfterMinutes} min after class`}
            hint="Latest auto check-in still counts (e.g. a client who arrives a few minutes late)."
            error={fieldErrors.checkInWindowAfterMinutes}
          >
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={values.checkInWindowAfterMinutes}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  checkInWindowAfterMinutes: Number(e.target.value),
                }))
              }
              className="w-full cursor-pointer accent-accent"
              aria-valuemin={0}
              aria-valuemax={30}
              aria-valuenow={values.checkInWindowAfterMinutes}
            />
          </FormField>

          <label
            className={cn(
              'flex cursor-pointer items-start gap-s3 rounded-md border p-s4',
              values.enabled
                ? 'border-sage-soft bg-sage-tint-2'
                : 'border-line bg-surface-2',
            )}
          >
            <input
              type="checkbox"
              checked={values.enabled}
              onChange={(e) =>
                setValues((v) => ({ ...v, enabled: e.target.checked }))
              }
              className="mt-[2px] h-[18px] w-[18px] cursor-pointer accent-accent"
            />
            <span className="flex flex-col gap-[2px]">
              <span className="t-body-md font-medium text-ink">
                Geofence active
              </span>
              <span className="t-caption text-ink-3">
                Clients with the PWA installed can auto check-in inside this
                radius. Disable to keep the config but pause auto check-in.
              </span>
            </span>
          </label>

            <div className="flex flex-wrap items-center gap-s3">
              <SaveButton disabled={!canSave} />
            </div>
          </form>

          {initialGeofence && (
            <form
              action={deleteFormAction}
              className="m-0 border-t border-line pt-s4"
            >
              <input
                type="hidden"
                name="locationId"
                value={selectedLocation.id}
              />
              <div className="flex flex-col gap-s2">
                <span className="t-eyebrow text-ink-3">DANGER ZONE</span>
                <p className="t-body-sm text-ink-soft">
                  Removes the geofence row entirely. To temporarily pause
                  without losing the config, untick &ldquo;Geofence active&rdquo;
                  above and save.
                </p>
                <DeleteButton onConfirm={() => undefined} />
              </div>
            </form>
          )}
        </div>
      </div>

      <p className="t-body-sm text-ink-soft">
        Save changes to apply. Clients with geofence enabled will see auto
        check-in on their next class.
      </p>
    </div>
  );
}
