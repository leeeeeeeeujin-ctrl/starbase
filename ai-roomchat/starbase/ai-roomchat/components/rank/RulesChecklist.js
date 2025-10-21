// components/rank/RulesChecklist.js
import { rulesChecklistCopy } from '../../data/rankRegistrationContent'

export default function RulesChecklist({ value, onChange }) {
  const v = value || {}
  const set = (k, val) => onChange?.({ ...v, [k]: val })

  return (
    <div style={{ display:'grid', gap:8 }}>
      {(rulesChecklistCopy.toggles || []).map((toggle) => (
        <Toggle
          key={toggle.key}
          label={toggle.label}
          checked={!!v[toggle.key]}
          onChange={(checked) => set(toggle.key, checked)}
        />
      ))}

      <label style={{ display:'grid', gap:4, marginTop:6 }}>
        <span>{rulesChecklistCopy.charLimit.label}</span>
        <input type="number" min="0" value={v.char_limit ?? 0} onChange={e=>set('char_limit', Math.max(0, parseInt(e.target.value||'0',10)))} />
      </label>
    </div>
  )
}

function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:8 }}>
      <input type="checkbox" checked={checked} onChange={e=>onChange?.(e.target.checked)} />
      {label}
    </label>
  )
}

export { buildRulesPrefix } from '../../lib/rank/rules'
