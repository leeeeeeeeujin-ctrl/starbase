const panelStyles = {
  root: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: 12,
    display: 'grid',
    gap: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  formGrid: {
    display: 'grid',
    gap: 8,
    gridTemplateColumns: '1fr 1fr',
    alignItems: 'end',
  },
  label: { display: 'grid', gap: 4 },
  input: { width: '100%' },
  textArea: { width: '100%' },
  roleList: { display: 'grid', gap: 6 },
  roleRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr auto',
    gap: 8,
  },
  addButton: { marginTop: 8 },
  submitButton: {
    padding: '8px 12px',
    borderRadius: 8,
    background: '#111827',
    color: '#fff',
    border: 'none',
  },
  actionRow: { marginTop: 12 },
  total: { color: '#64748b' },
}

export default function RegisterGamePanel({ form, onSubmit }) {
  const {
    gName,
    setGName,
    gDesc,
    setGDesc,
    gImage,
    setGImage,
    gPromptSetId,
    setGPromptSetId,
    roles,
    setRoles,
    totalSlots,
  } = form
  const handleRoleChange = (index, field, value) => {
    setRoles((current) => {
      const next = [...current]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleRemoveRole = (index) => {
    setRoles((current) => {
      const next = [...current]
      next.splice(index, 1)
      return next
    })
  }

  const handleAddRole = () => {
    setRoles((current) => [...current, { name: '새 역할', slot_count: 1 }])
  }

  return (
    <section style={panelStyles.root}>
      <div style={panelStyles.header}>
        <h3 style={{ margin: '4px 0' }}>게임 등록</h3>
        <div style={panelStyles.total}>슬롯 합계: <b>{totalSlots}</b></div>
      </div>

      <div style={panelStyles.formGrid}>
        <label style={panelStyles.label}>
          이름
          <input value={gName} onChange={(event) => setGName(event.target.value)} style={panelStyles.input} />
        </label>
        <label style={panelStyles.label}>
          이미지 URL
          <input value={gImage} onChange={(event) => setGImage(event.target.value)} style={panelStyles.input} />
        </label>
        <label style={{ ...panelStyles.label, gridColumn: '1 / span 2' }}>
          설명
          <textarea
            value={gDesc}
            onChange={(event) => setGDesc(event.target.value)}
            rows={2}
            style={panelStyles.textArea}
          />
        </label>
        <label style={{ ...panelStyles.label, gridColumn: '1 / span 2' }}>
          프롬프트 세트 ID
          <input
            value={gPromptSetId}
            onChange={(event) => setGPromptSetId(event.target.value)}
            style={panelStyles.input}
          />
        </label>
      </div>

      <div>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>역할 / 슬롯 수</div>
        <div style={panelStyles.roleList}>
          {roles.map((role, index) => (
            <div key={index} style={panelStyles.roleRow}>
              <input
                value={role.name}
                onChange={(event) => handleRoleChange(index, 'name', event.target.value)}
                placeholder="역할명"
              />
              <input
                type="number"
                min="1"
                max="12"
                value={role.slot_count}
                onChange={(event) => handleRoleChange(index, 'slot_count', event.target.value)}
              />
              <button type="button" onClick={() => handleRemoveRole(index)}>
                삭제
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={handleAddRole} style={panelStyles.addButton}>
          + 역할 추가
        </button>
      </div>

      <div style={panelStyles.actionRow}>
        <button type="button" onClick={onSubmit} style={panelStyles.submitButton}>
          게임 등록
        </button>
      </div>
    </section>
  )
}
