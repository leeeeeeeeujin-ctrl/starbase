'use client'

export default function RegistrationCard({
  title,
  description,
  actions,
  children,
  style = {},
  contentGap = 18,
}) {
  return (
    <section
      style={{
        background: 'rgba(15,23,42,0.78)',
        borderRadius: 24,
        padding: '24px 28px',
        boxShadow: '0 32px 68px -48px rgba(15, 23, 42, 0.8)',
        color: '#e2e8f0',
        display: 'grid',
        gap: 18,
        ...style,
      }}
    >
      {(title || description || actions) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: description ? 'flex-start' : 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'grid', gap: 6, minWidth: 200 }}>
            {title ? (
              <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>{title}</p>
            ) : null}
            {description ? (
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#cbd5f5' }}>{description}</p>
            ) : null}
          </div>
          {actions ? <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>{actions}</div> : null}
        </div>
      )}

      <div style={{ display: 'grid', gap: contentGap }}>{children}</div>
    </section>
  )
}
