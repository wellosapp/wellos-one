'use client';

import { useState } from 'react';

import { Button } from '@/components/ui';

// Admin-side "where am I" button. Calls navigator.geolocation.getCurrentPosition
// once; on success, hands lat/lng back to the editor so the marker + circle
// can jump to the admin's current spot. Completely separate from the
// client-side PWA polling that PR 9 will build — this is a one-shot lookup
// while the admin is standing inside the studio configuring the geofence.

type Props = {
  onLocationFound: (lat: number, lng: number) => void;
  disabled?: boolean;
};

export function UseCurrentLocationButton({ onLocationFound, disabled }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Geolocation is not available in this browser.');
      return;
    }

    setPending(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPending(false);
        onLocationFound(position.coords.latitude, position.coords.longitude);
      },
      (err) => {
        setPending(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError(
            'Location permission denied. Allow location access in your browser and try again.',
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError('Could not determine your location right now.');
        } else if (err.code === err.TIMEOUT) {
          setError('Timed out waiting for your location. Try again.');
        } else {
          setError(err.message || 'Could not get your location.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 0,
      },
    );
  }

  return (
    <div className="flex flex-col gap-s2">
      <Button
        type="button"
        variant="ghost"
        size="md"
        onClick={handleClick}
        disabled={disabled || pending}
        loading={pending}
      >
        {pending ? 'Locating…' : 'Use current location'}
      </Button>
      {error && (
        <p className="t-caption text-red" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
