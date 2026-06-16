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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-transparent.png"
          alt="KFG"
          style={{ width: 'auto', height: 52, objectFit: 'contain' }}
        />
        <div style={{
          fontSize: 11, letterSpacing: '.32em', textTransform: 'uppercase',
          color: '#8a8c9e', fontFamily: 'var(--font-inter), sans-serif',
          fontWeight: 600,
        }}>
          KFG · setting the table…
        </div>
      </div>
    </div>
  );
}
