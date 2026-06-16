import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: 'var(--cream)',
      fontFamily: 'var(--font-inter), Inter, sans-serif',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 20,
        border: '1px solid var(--line-soft)',
        padding: '48px 36px',
        maxWidth: 440,
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 8px 32px -8px rgba(21,23,43,0.12)',
      }}>
        <div style={{
          fontFamily: 'var(--font-cormorant), serif',
          fontSize: 72, fontWeight: 700, color: 'var(--blue)',
          lineHeight: 1, marginBottom: 12,
        }}>
          404
        </div>
        <h1 style={{
          fontFamily: 'var(--font-cormorant), serif',
          fontSize: 28, fontWeight: 600, color: 'var(--ink)',
          margin: '0 0 8px',
        }}>
          Page not found
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 28px', lineHeight: 1.6 }}>
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '10px 22px',
            background: 'var(--blue)', color: '#fff',
            borderRadius: 10, textDecoration: 'none',
            fontFamily: 'var(--font-inter), Inter, sans-serif',
            fontSize: 13.5, fontWeight: 600,
          }}
        >
          Back to menu
        </Link>
      </div>
    </div>
  );
}
