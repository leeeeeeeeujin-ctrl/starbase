export default function StatusBanner({ message }) {
  if (!message) return null

  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        background: '#eff6ff',
        color: '#1d4ed8',
      }}
    >
      {message}
    </div>
  )
}

//
