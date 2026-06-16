export default function Loading() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#e9e8e3',
      backgroundImage: 'linear-gradient(180deg,#dedcd5,#e9e8e3 40%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
        color: '#30378f',
      }}>
        <div style={{
          width: 44, height: 52,
          border: '1.5px solid currentColor', borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-cormorant), serif',
          fontWeight: 700, fontSize: 18,
          letterSpacing: '.02em',
          position: 'relative',
        }}>
          <span style={{ marginTop: 10 }}>HJ</span>
        </div>
        <div style={{
          fontSize: 11, letterSpacing: '.32em', textTransform: 'uppercase',
          color: '#8a8c9e', fontFamily: 'var(--font-inter), sans-serif',
          fontWeight: 600,
        }}>
          Hotel Jazeera · setting the table…
        </div>
      </div>
    </div>
  );
}
