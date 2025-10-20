function DrawerShell({ onClose, children }) {
  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose?.()
    }
  }

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        zIndex: 90,
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          boxShadow: '-24px 0 60px -30px rgba(15, 23, 42, 0.4)',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'grid' }}>
            <strong style={{ color: '#0f172a' }}>변수 규칙 설정</strong>
            <span style={{ fontSize: 12, color: '#64748b' }}>전역/로컬 규칙을 한 번에 관리하세요.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              background: '#f1f5f9',
              border: '1px solid #cbd5f5',
              color: '#0f172a',
              fontWeight: 600,
            }}
          >
            닫기
          </button>
        </div>
        <div
          style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            padding: 16,
            display: 'grid',
            gap: 16,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

export default DrawerShell

//
