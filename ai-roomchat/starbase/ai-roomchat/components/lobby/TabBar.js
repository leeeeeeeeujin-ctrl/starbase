
export default function TabBar({ tabs, activeTab, onChange }) {
  return (
    <div style={{ ...styles.root, gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((tab) => {
        const active = tab.key === activeTab
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            style={{ ...styles.tab, ...(active ? styles.active : styles.inactive) }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

const styles = {
  root: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 12,
  },
  tab: {
    padding: '12px 14px',
    borderRadius: 18,
    border: '1px solid #d1d5db',
    fontWeight: 600,
    background: '#f8fafc',
  },
  active: {
    background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
    color: '#fff',
    borderColor: '#2563eb',
    boxShadow: '0 20px 45px -32px rgba(37, 99, 235, 0.75)',
  },
  inactive: {
    color: '#0f172a',
  },
}
//
