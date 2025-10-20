import { MODE_LABEL } from './constants'
import { VARIABLE_RULE_MODES } from '../../../../lib/variableRules'

function ModeSelector({ activeMode, onSelect }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {VARIABLE_RULE_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onSelect(mode)}
          style={{
            padding: '6px 10px',
            borderRadius: 999,
            border: activeMode === mode ? '1px solid #0ea5e9' : '1px solid #cbd5f5',
            background: activeMode === mode ? '#e0f2fe' : '#f8fafc',
            fontWeight: 600,
            color: activeMode === mode ? '#0369a1' : '#475569',
          }}
        >
          {MODE_LABEL[mode]}
        </button>
      ))}
    </div>
  )
}

export default ModeSelector

//
