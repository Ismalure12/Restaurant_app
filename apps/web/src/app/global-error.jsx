'use client';

/**
 * Last-resort boundary: this replaces the root layout, so globals.css (and
 * therefore every design token) is NOT loaded here. The palette below is the
 * only place in the app allowed to hardcode colour — the values are the light
 * theme's tokens copied literally, and they must be updated with them.
 *   --canvas #FAF9F7 · --surface #FFFFFF · --line #E4E0DA · --ink #1A1618
 *   --muted #6B6165 · --neg #B53426 · --neg-soft #FBE9E6 · --primary #850D33
 */
export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
          background: '#FAF9F7',
          color: '#1A1618',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}>
          <div style={{
            width: '100%',
            maxWidth: 420,
            padding: '40px 32px',
            background: '#FFFFFF',
            border: '1px solid #E4E0DA',
            borderRadius: 18,
            boxShadow: '0 2px 4px rgba(26,22,24,.04), 0 8px 24px -12px rgba(26,22,24,.12)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{
              width: 52, height: 52, marginBottom: 8, borderRadius: '50%',
              background: '#FBE9E6', color: '#B53426',
              display: 'grid', placeItems: 'center',
            }} aria-hidden="true">
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              </svg>
            </span>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
              The app failed to load
            </h1>
            <p style={{ margin: 0, maxWidth: '34ch', fontSize: 14, lineHeight: 1.65, color: '#6B6165' }}>
              Nothing was charged and nothing was saved. Reloading usually clears it.
            </p>
            {error?.digest && (
              <p style={{
                margin: '4px 0 0', padding: '4px 9px', borderRadius: 6,
                background: '#F5F3F0', fontFamily: 'ui-monospace, Menlo, monospace',
                fontSize: 11, color: '#6B6165',
              }}>
                ref {error.digest}
              </p>
            )}
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 16, minHeight: 44, padding: '0 20px', border: 'none',
                borderRadius: 10, background: '#850D33', color: '#FFFFFF',
                fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
