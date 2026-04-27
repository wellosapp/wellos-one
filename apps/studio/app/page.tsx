import { ThrowErrorButton } from './throw-error-button';

export default function Home() {
  return (
    <main style={{ padding: '4rem 2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Wellos Studio</h1>
      <p style={{ color: '#555' }}>
        Booking, payments, and CRM for solo practitioners and small studios.
      </p>
      <p style={{ color: '#888', marginTop: '2rem', fontSize: '0.875rem' }}>
        Hello-world scaffold — full app coming, deploying to{' '}
        <code>app.wellos.studio</code>.
      </p>
      <ThrowErrorButton />
    </main>
  );
}
