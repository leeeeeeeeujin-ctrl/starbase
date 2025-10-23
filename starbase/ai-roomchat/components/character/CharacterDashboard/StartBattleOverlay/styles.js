export const baseStyles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(2, 6, 23, 0.88)',
    backdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    zIndex: 1200,
  },
  modal: {
    width: '100%',
    maxWidth: 720,
    borderRadius: 28,
    border: '1px solid rgba(56, 189, 248, 0.45)',
    background: 'linear-gradient(180deg, rgba(15, 118, 110, 0.38) 0%, rgba(2, 6, 23, 0.94) 100%)',
    color: '#e2e8f0',
    padding: '28px 24px',
    display: 'grid',
    gap: 20,
    boxShadow: '0 50px 120px -60px rgba(56, 189, 248, 0.85)',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 24,
  },
  subtitle: {
    margin: '6px 0 0',
    fontSize: 13,
    color: '#bae6fd',
  },
  closeButton: {
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.75)',
    color: '#e2e8f0',
    fontWeight: 600,
  },
  actionRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    flexWrap: 'wrap',
  },
  secondaryButton: {
    padding: '12px 18px',
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.4)',
    background: 'rgba(15, 23, 42, 0.7)',
    color: '#e2e8f0',
    fontWeight: 600,
  },
  primaryButton: {
    padding: '12px 22px',
    borderRadius: 999,
    border: 'none',
    background: '#38bdf8',
    color: '#020617',
    fontWeight: 800,
  },
};

export const previewStyles = {
  container: {
    borderRadius: 22,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.75)',
    padding: 18,
    display: 'grid',
    gap: 12,
  },
  heroSummary: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  heroPortrait: {
    width: 72,
    height: 72,
    borderRadius: 24,
    overflow: 'hidden',
    border: '1px solid rgba(56, 189, 248, 0.45)',
    background: 'rgba(2, 6, 23, 0.9)',
    flexShrink: 0,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  heroPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#38bdf8',
    fontWeight: 700,
  },
  heroCopy: {
    display: 'grid',
    gap: 6,
  },
  heroName: {
    fontSize: 20,
  },
  heroRole: {
    fontSize: 13,
    color: '#94a3b8',
  },
  heroHelp: {
    margin: 0,
    fontSize: 13,
    color: '#cbd5f5',
    lineHeight: 1.6,
  },
  opponentList: {
    display: 'grid',
    gap: 14,
  },
  opponentCard: {
    borderRadius: 20,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    background: 'rgba(15, 23, 42, 0.7)',
    padding: 16,
    display: 'grid',
    gap: 10,
  },
  opponentHeader: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  opponentPortrait: {
    width: 60,
    height: 60,
    borderRadius: 18,
    overflow: 'hidden',
    border: '1px solid rgba(56, 189, 248, 0.25)',
    background: 'rgba(15, 23, 42, 0.9)',
    flexShrink: 0,
  },
  opponentImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  opponentPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#38bdf8',
    fontWeight: 700,
  },
  opponentCopy: {
    display: 'grid',
    gap: 4,
  },
  opponentName: {
    fontSize: 18,
  },
  opponentRole: {
    fontSize: 12,
    color: '#94a3b8',
  },
  abilityList: {
    display: 'grid',
    gap: 6,
  },
  abilityChip: {
    borderRadius: 14,
    border: '1px solid rgba(56, 189, 248, 0.25)',
    background: 'rgba(8, 47, 73, 0.65)',
    padding: '10px 12px',
    fontSize: 13,
    color: '#e0f2fe',
    lineHeight: 1.6,
  },
  emptyOpponents: {
    borderRadius: 20,
    border: '1px dashed rgba(148, 163, 184, 0.3)',
    background: 'rgba(15, 23, 42, 0.65)',
    padding: 20,
    textAlign: 'center',
    color: '#94a3b8',
  },
};

export const matchingStyles = {
  section: {
    display: 'grid',
    gap: 18,
  },
  card: {
    borderRadius: 20,
    padding: 18,
    border: '1px solid rgba(56, 189, 248, 0.35)',
    background: 'rgba(8, 47, 73, 0.7)',
    display: 'grid',
    gap: 12,
  },
  title: {
    fontSize: 18,
  },
  copy: {
    margin: 0,
    fontSize: 13,
    color: '#cbd5f5',
    lineHeight: 1.6,
  },
  progressBar: {
    height: 12,
    borderRadius: 999,
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(15, 23, 42, 0.85)',
    overflow: 'hidden',
  },
  progressIndicator: {
    height: '100%',
    background: 'linear-gradient(90deg, rgba(14, 165, 233, 0.9), rgba(59, 130, 246, 0.9))',
    transition: 'width 0.28s ease',
  },
  progressValue: {
    fontSize: 12,
    color: '#bae6fd',
    textAlign: 'right',
  },
  list: {
    display: 'grid',
    gap: 12,
  },
  row: {
    borderRadius: 18,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    background: 'rgba(15, 23, 42, 0.7)',
    padding: 14,
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  identity: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  portrait: {
    width: 54,
    height: 54,
    borderRadius: 16,
    overflow: 'hidden',
    border: '1px solid rgba(56, 189, 248, 0.3)',
    background: 'rgba(2, 6, 23, 0.9)',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#38bdf8',
    fontWeight: 700,
  },
  name: {
    fontSize: 16,
  },
  role: {
    fontSize: 12,
    color: '#94a3b8',
  },
  status: {
    fontSize: 12,
    fontWeight: 700,
  },
};

export const readyStyles = {
  section: {
    display: 'grid',
    gap: 18,
  },
  card: {
    borderRadius: 22,
    border: '1px solid rgba(56, 189, 248, 0.45)',
    background: 'rgba(8, 47, 73, 0.75)',
    padding: 20,
    display: 'grid',
    gap: 12,
  },
  title: {
    fontSize: 20,
  },
  copy: {
    margin: 0,
    fontSize: 13,
    color: '#bae6fd',
    lineHeight: 1.6,
  },
};

//
