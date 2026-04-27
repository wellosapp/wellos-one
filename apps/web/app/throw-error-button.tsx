'use client';

// Verification button for Sentry. Clicking throws an unhandled error,
// which Sentry's error boundary should catch and report. Useful only
// during initial setup — remove or hide behind a feature flag once
// real product code lands.

export function ThrowErrorButton() {
  return (
    <button
      type="button"
      onClick={() => {
        throw new Error(
          'Sentry test error from apps/web ThrowErrorButton — if you see this in Sentry, the wire is good.',
        );
      }}
      style={{
        marginTop: '1.5rem',
        padding: '0.5rem 1rem',
        background: '#1a1a1a',
        color: '#fafaf7',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '0.875rem',
      }}
    >
      Throw a test error (Sentry)
    </button>
  );
}
