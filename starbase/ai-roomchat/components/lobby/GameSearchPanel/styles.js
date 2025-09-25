export const styles = {
  root: {
    background: '#ffffff',
    borderRadius: 24,
    boxShadow: '0 28px 60px -46px rgba(15, 23, 42, 0.55)',
    padding: 18,
    display: 'grid',
    gap: 14,
  },
  searchColumn: {
    display: 'grid',
    gap: 10,
  },
  searchInputs: {
    display: 'grid',
    gridTemplateColumns: '1fr 120px',
    gap: 10,
  },
  searchInput: {
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
  },
  sortSelect: {
    padding: '12px 14px',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
  },
  listBox: {
    border: '1px solid #e5e7eb',
    borderRadius: 16,
    padding: 12,
    maxHeight: '45vh',
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    display: 'grid',
    gap: 10,
  },
  emptyState: {
    padding: 12,
    textAlign: 'center',
    color: '#64748b',
  },
  gameRow: {
    textAlign: 'left',
    display: 'grid',
    gridTemplateColumns: '64px 1fr auto',
    gap: 12,
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: 16,
  },
  gameRowActive: {
    border: '2px solid #2563eb',
    background: 'rgba(37, 99, 235, 0.08)',
  },
  gameRowInactive: {
    border: '1px solid #e2e8f0',
    background: '#f9fafb',
  },
  gameThumb: {
    width: 64,
    height: 64,
    borderRadius: 14,
    overflow: 'hidden',
    background: '#e2e8f0',
  },
  gameThumbImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  gameInfo: {
    display: 'grid',
    gap: 4,
  },
  gameTitle: {
    fontSize: 15,
    color: '#0f172a',
  },
  gameDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 1.4,
  },
  gameMeta: {
    display: 'flex',
    gap: 12,
    fontSize: 12,
    color: '#94a3b8',
  },
  gameDate: {
    fontSize: 12,
    color: '#94a3b8',
  },
  detailBox: {
    border: '1px solid #e2e8f0',
    borderRadius: 20,
    padding: 16,
    display: 'grid',
    gap: 12,
    background: '#f9fafc',
  },
  detailHeader: {
    display: 'grid',
    gap: 6,
  },
  detailTitle: {
    fontSize: 16,
    color: '#0f172a',
  },
  detailDesc: {
    margin: 0,
    fontSize: 13,
    color: '#475569',
    lineHeight: 1.6,
  },
  roleSection: {
    display: 'grid',
    gap: 10,
  },
  roleLabel: {
    fontWeight: 600,
    color: '#0f172a',
  },
  roleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: 10,
  },
  roleButton: {
    borderRadius: 14,
    padding: '12px 14px',
    border: '1px solid #e2e8f0',
    display: 'grid',
    gap: 6,
    background: '#fff',
  },
  roleButtonActive: {
    borderColor: '#2563eb',
    background: 'rgba(37, 99, 235, 0.1)',
  },
  roleButtonInactive: {},
  roleButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  roleSlotMeta: {
    fontSize: 12,
    color: '#64748b',
  },
  participantSection: {
    display: 'grid',
    gap: 10,
  },
  participantLabel: {
    fontWeight: 600,
    color: '#0f172a',
  },
  participantList: {
    border: '1px solid #e2e8f0',
    borderRadius: 16,
    padding: 12,
    display: 'grid',
    gap: 10,
    background: '#fff',
  },
  participantRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    color: '#1f2937',
  },
  participantName: {
    fontWeight: 600,
  },
  participantRole: {
    color: '#64748b',
  },
  enterButton: {
    marginTop: 4,
    padding: '12px 16px',
    borderRadius: 12,
    background: '#2563eb',
    color: '#fff',
    fontWeight: 700,
    border: 'none',
  },
}

export default styles
//
