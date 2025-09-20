// pages/api/rank/play.js
export const config = { runtime: 'edge' } // vercel edge 가능(선택)

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false }
})

async function compilePromptSet({ prompt_set_id, slotsMap, historyText }) {
  // slotsMap: { [slotIndex: 1..12]: { name, description, ability1..12 } }
  // 최소 구현: 첫 시작 노드만 템플릿 치환
  const { data: slots } = await supabase
    .from('prompt_slots')
    .select('id,slot_no,slot_type,template')
    .eq('set_id', prompt_set_id)
    .order('slot_no', { ascending: true })

  if (!slots?.length) return { prompt: '', meta: { usedSlot: null } }

  let out = slots[0].template || ''
  // {{slotX.name}}, {{slotX.description}}, {{slotX.abilityY}}, {{history.last1/2}}
  const lines = (historyText || '').split(/\r?\n/)
  const last1 = lines.slice(-1).join('\n')
  const last2 = lines.slice(-2).join('\n')

  for (let s = 1; s <= 12; s++) {
    const hero = slotsMap[s]
    if (!hero) continue
    out = out.replaceAll(`{{slot${s}.name}}`, hero.name ?? '')
    out = out.replaceAll(`{{slot${s}.description}}`, hero.description ?? '')
    for (let a = 1; a <= 12; a++) {
      out = out.replaceAll(`{{slot${s}.ability${a}}}`, hero[`ability${a}`] ?? '')
    }
  }
  out = out.replaceAll('{{history.last1}}', last1)
  out = out.replaceAll('{{history.last2}}', last2)

  // TODO: 브릿지 조건/다음 노드 추적은 이후 확장
  return { prompt: out, meta: { startSlotId: slots[0].id } }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
    const { gameId, heroIds = [], roleId = null, userApiKey } = await req.body || {}

    // 인증 유저
    const { data: { user }, error: uerr } = await supabase.auth.getUser()
    if (uerr || !user) return res.status(401).json({ error: 'unauthorized' })

    // 게임 & 참가자 & 상대 고르기
    const { data: game, error: gerr } = await supabase.from('rank_games').select('*').eq('id', gameId).single()
    if (gerr || !game) return res.status(404).json({ error: 'game_not_found' })

    // 내 캐릭터 팩(인자로 받은 heroIds를 사용해 한 판 “임시팩”) + 내 점수(기본 1000)
    const myPack = { owner_id: user.id, hero_ids: heroIds }

    // 상대: 비실시간, 유사점수대 랜덤 1명
    const { data: candidates } = await supabase
      .from('rank_participants')
      .select('owner_id, hero_ids, rating')
      .eq('game_id', gameId)
      .neq('owner_id', user.id)
      .order('rating', { ascending: false })
      .limit(50)

    let opp = null
    if (candidates?.length) {
      // 간단: 가장 가까운 rating
      opp = candidates.reduce((best, c) => {
        const br = Math.abs((best?.rating ?? 1000) - 1000)
        const cr = Math.abs(c.rating - 1000)
        return cr < br ? c : best
      }, candidates[0])
    } else {
      // 상대가 없으면 내 팩을 복제(자기 자신과 스파링)
      opp = { owner_id: null, hero_ids: heroIds, rating: 1000 }
    }

    // 프롬프트 세트 컴파일(슬롯 매핑: 게임 역할/규칙 확장 전 MVP)
    // 여기선 슬롯1~N에 내/상대 캐릭터를 번갈아 배치한다고 가정
    const slotsMap = {}
    // TODO: 실제로는 heroes 테이블에서 heroIds로 name/description/ability.. 가져오기
    // MVP: 이름만 채우는 더미
    for (let i = 0; i < Math.min(12, heroIds.length); i++) {
      slotsMap[i+1] = { name: `내캐릭${i+1}`, description: '', ability1:'', ability2:'', ability3:'', ability4:'' }
    }
    for (let j = 0; j < Math.min(12-heroIds.length, opp.hero_ids.length); j++) {
      slotsMap[heroIds.length + j + 1] = { name:`상대${j+1}`, description:'', ability1:'', ability2:'', ability3:'', ability4:'' }
    }

    const { prompt } = await compilePromptSet({
      prompt_set_id: game.prompt_set_id,
      slotsMap,
      historyText: ''  // 첫 턴
    })

    if (!userApiKey || typeof userApiKey !== 'string') {
      return res.status(400).json({ error: 'missing_user_api_key' })
    }

    // --- AI 호출 (OpenAI 호환) ---
    let aiText = ''
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',                    // 가벼운 모델 우선
          messages: [
            { role: 'system', content: '당신은 비동기 PvE 랭킹 전투의 심판/해설자 겸 시뮬레이터입니다.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7
        })
      })

      if (resp.status === 401 || resp.status === 429) {
        return res.status(200).json({ error: 'quota_exhausted' })
      }
      if (!resp.ok) {
        const e = await resp.text()
        return res.status(200).json({ error: 'ai_failed', detail: e.slice(0, 500) })
      }
      const json = await resp.json()
      aiText = json.choices?.[0]?.message?.content ?? ''
    } catch (e) {
      return res.status(200).json({ error: 'ai_network_error' })
    }

    // --- 응답 분석 → 간단 승/패/무 (MVP: 키워드 룰) ---
    // 이후엔 rank_bridges(조건식)로 판정 확장
    const lower = aiText.toLowerCase()
    let outcome = 'draw'
    if (lower.includes('win') || lower.includes('승리')) outcome = 'win'
    else if (lower.includes('lose') || lower.includes('패배')) outcome = 'lose'

    const delta = outcome === 'win' ? game.score_win
               : outcome === 'lose' ? game.score_loss
               : game.score_draw

    // 기록(정상 판정만)
    const { data: battle } = await supabase.from('rank_battles').insert({
      game_id: game.id,
      attacker_owner_id: user.id,
      attacker_hero_ids: heroIds,
      defender_owner_id: opp.owner_id,
      defender_hero_ids: opp.hero_ids,
      result: outcome,
      score_delta: delta,
      hidden: false
    }).select().single()

    await supabase.from('rank_battle_logs').insert({
      battle_id: battle.id,
      turn_no: 1,
      prompt,
      ai_response: aiText,
      meta: { outcome }
    })

    // 내 레이팅 반영(단순 가감)
    await supabase.rpc('increment_rating', { p_game_id: game.id, p_owner: user.id, p_delta: delta })
    // ↑ 없으면 아래로 대체:
    // await supabase.from('rank_participants').update({
    //   rating: supabase.rpc('LEAST', { a: 5000, b: supabase.rpc('GREATEST', { a: 0, b: 'rating + delta' }) })
    // }).eq('game_id', game.id).eq('owner_id', user.id)

    return res.status(200).json({ ok: true, outcome, delta, battleId: battle.id, text: aiText })
  } catch (e) {
    return res.status(500).json({ error: 'server_error', detail: String(e).slice(0, 300) })
  }
}
