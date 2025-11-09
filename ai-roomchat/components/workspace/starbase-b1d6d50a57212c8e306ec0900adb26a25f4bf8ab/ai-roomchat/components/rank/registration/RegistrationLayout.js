'use client';

export default function RegistrationLayout({
  backgroundImage,
  title,
  subtitle,
  onBack,
  sidebar,
  children,
  footer,
}) {
  const pageStyle = backgroundImage
    ? {
        minHeight: '100vh',
        backgroundImage:
          'linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.96) 100%), ' +
          `url(${backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        display: 'flex',
        flexDirection: 'column',
      }
    : {
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #0f172a 0%, #1f2937 28%, #0f172a 100%)',
        display: 'flex',
        flexDirection: 'column',
      };

  return (
    <div style={pageStyle}>
      <div
        style={{
          flex: '1 1 auto',
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          padding: '32px 16px 180px',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 1180,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              color: '#f8fafc',
            }}
          >
            <div style={{ display: 'grid', gap: 4 }}>
              <h2 style={{ margin: 0, fontSize: 28 }}>{title || '게임 등록'}</h2>
              {subtitle ? (
                <p style={{ margin: 0, fontSize: 14, color: '#cbd5f5' }}>{subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onBack}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                border: '1px solid rgba(148,163,184,0.45)',
                background: 'rgba(15,23,42,0.55)',
                color: '#e2e8f0',
                fontWeight: 600,
              }}
            >
              ← 뒤로
            </button>
          </header>

          <div
            style={{
              display: 'grid',
              gap: 24,
              gridTemplateColumns: sidebar ? 'minmax(0, 2fr) minmax(0, 320px)' : 'minmax(0, 1fr)',
              alignItems: 'start',
            }}
          >
            <main style={{ display: 'grid', gap: 20 }}>{children}</main>
            {sidebar ? <aside style={{ display: 'grid', gap: 18 }}>{sidebar}</aside> : null}
          </div>

          {footer ? <div>{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
