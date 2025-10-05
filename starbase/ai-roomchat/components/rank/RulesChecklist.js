// components/rank/RulesChecklist.js
export default function RulesChecklist({ value, onChange }) {
  const v = value || {}
  const set = (k, val) => onChange?.({ ...v, [k]: val })

  return (
    <div style={{ display:'grid', gap:8 }}>
      <Toggle label="통찰 너프" checked={!!v.nerf_insight} onChange={b=>set('nerf_insight', b)} />
      <Toggle label="약자 배려 금지" checked={!!v.ban_kindness} onChange={b=>set('ban_kindness', b)} />
      <Toggle label="평화 너프" checked={!!v.nerf_peace} onChange={b=>set('nerf_peace', b)} />
      <Toggle label="궁극적 승리/인젝션 너프" checked={!!v.nerf_ultimate_injection} onChange={b=>set('nerf_ultimate_injection', b)} />
      <Toggle label="공정한 파워밸런스" checked={!!v.fair_power_balance} onChange={b=>set('fair_power_balance', b)} />

      <label style={{ display:'grid', gap:4, marginTop:6 }}>
        <span>AI가 응답할 문장 길이(글자수 기준, 0=미지정)</span>
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
