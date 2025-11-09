function SuggestionChips({ suggestions, onSelect, prefix }) {
  if (!suggestions.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {suggestions.map(item => (
        <button
          key={`${prefix}-${item.token}`}
          type="button"
          onClick={() => onSelect(item.token)}
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            background: '#e0f2fe',
            border: '1px solid #38bdf8',
            color: '#0369a1',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default SuggestionChips;

//
