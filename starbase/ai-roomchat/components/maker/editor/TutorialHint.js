'use client'

export default function TutorialHint({ label = '튜토리얼', description }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={description}
      onMouseDown={(event) => event.preventDefault()}
      style={{
        border: '1px solid rgba(148, 163, 184, 0.35)',
        background: 'linear-gradient(135deg, rgba(248, 250, 252, 0.95), rgba(226, 232, 240, 0.9))',
        color: '#1e293b',
        width: 28,
        height: 28,
        borderRadius: '50%',
        fontWeight: 700,
        fontSize: 14,
        boxShadow: '0 8px 18px -12px rgba(15, 23, 42, 0.45)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'help',
      }}
    >
      ?
    </button>
  )
}
