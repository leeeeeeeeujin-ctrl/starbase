// components/rank/RankNewClient.js
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import PromptSetPicker from '../../components/rank/PromptSetPicker'
import SlotMatrix from '../../components/rank/SlotMatrix'
import RolesEditor from '../../components/rank/RolesEditor'
import RulesChecklist, { buildRulesPrefix } from '../../components/rank/RulesChecklist'
import { uploadGameImage } from '../../lib/rank/storage'

async function registerGame(payload) {
  const r = await fetch('/api/rank/register-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return r.json()
}

export default function RankNewClient() {
  const router = useRouter()
  const [user, setUser] = useState(null)

  // 기본 정보
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [imgFile, setImgFile] = useState(null)
  const [setId, setSetId] = useState('')

  // 역할/슬롯
  const [roles, setRoles] = useState(['공격', '수비'])
  const [slotMap, setSlotMap] = useState([])

  // 규칙
  const [rules, setRules] = useState({
    nerf_insight: false,
    ban_kindness: false,
    nerf_peace: false,
    nerf_ultimate_injection: true,
    fair_power_balance: true,
    char_limit: 0,
  })

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!alive) return
      if (!user) { router.replace('/'); return }
      setUser(user)
    })()
    return () => { alive = false }
  }, [router])

  const activeSlots = useMemo(
    () => (slotMap || []).filter(s => s.active && s.role && s.role.trim()),
    [slotMap]
  )

  async function onSubmit() {
    if (!user) return alert('로그인이 필요합니다.')
    if (!setId) return alert('프롬프트 세트를 선택하세요.')
    if (activeSlots.length === 0) return alert('최소 1개의 슬롯을 활성화하고 역할을 지정하세요.')

    let image_url = ''
    if (imgFile) {
      try {
        const up = await uploadGameImage(imgFile)
        image_url = up.url
      } catch (e) {
        return alert('이미지 업로드 실패: ' + (e?.message || e))
      }
    }

    const res = await registerGame({
      name: name || '새 게임',
      description: desc || '',
      image_url,
      prompt_set_id: Number(setId),
      roles: roles.map(r => ({ name: r, slot_count: 1 })),
      rules,
      rules_prefix: buildRulesPrefix(rules),
    })
    if (!res.ok) return alert('게임 등록 실패: ' + (res.error || 'unknown'))

    const gameId = res.gameId
    const payload = activeSlots.map(s => ({
      game_id: gameId, slot_index: s.slot_index, role: s.role, active: true,
    }))
    await supabase.from('rank_game_slots').upsert(payload, { onConflict: 'game_id,slot_index' })

    alert('등록 완료')
    router.replace(`/rank/${gameId}`)
  }

  // 렌더
  return (
    <div style={{ maxWidth: 1000, margin: '24px auto', padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>게임 등록</h2>
        <button onClick={() => router.back()} style={{ padding: '6px 10px' }}>← 뒤로</button>
      </div>

      {/* 1) 역할 정의 */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>역할 정의</h3>
        <RolesEditor roles={roles} onChange={setRoles} />
      </div>

      {/* 2) 기본 정보 */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12, display: 'grid', gap: 8 }}>
        <input placeholder="게임 이름" value={name} onChange={e => setName(e.target.value)} />
        <textarea placeholder="설명" rows={3} value={desc} onChange={e => setDesc(e.target.value)} />
        <PromptSetPicker value={setId} onChange={setSetId} />
        <label>대표 이미지(선택)
          <input type="file" accept="image/*" onChange={e => setImgFile(e.target.files?.[0] || null)} />
        </label>
      </div>

      {/* 3) 슬롯 매핑 */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>슬롯 매핑</h3>
        <SlotMatrix value={slotMap} onChange={setSlotMap} roleOptions={roles} />
      </div>

      {/* 4) 규칙 체크리스트 */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff', padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>체크리스트 규칙 / 글자수</h3>
        <RulesChecklist value={rules} onChange={setRules} />
      </div>

      <div>
        <button
          onClick={onSubmit}
          style={{ padding: '10px 12px', borderRadius: 8, background: '#111827', color: '#fff', fontWeight: 700 }}
        >
          등록
        </button>
      </div>
    </div>
  )
}
