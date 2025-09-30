// pages/api/rank/play.js
import { supabase } from '@/lib/rank/db'
import { getActiveRoles, totalSlots } from '@/lib/rank/roles'
import { getOpponentCandidates, pickOpponentsPerSlots } from '@/lib/rank/participants'
import { loadHeroesMap, buildSlotsMap } from '@/lib/rank/heroes'
import { compileTemplate } from '@/lib/rank/prompt'
import { callChat } from '@/lib/rank/ai'
import { judgeOutcome } from '@/lib/rank/judge'
import { recordBattle } from '@/lib/rank/persist'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  try {
    const { gameId, heroIds = [], userApiKey } = req.body || {}

    const { data: { user }, error: uerr } = await supabase.auth.getUser()
    if (uerr || !user) return res.status(401).json({ error: 'unauthorized' })

    // 게임 메타
    const { data: game, error: gerr } = await supabase.from('rank_games').select('*').eq('id', gameId).single()
    if (gerr || !game) return res.status(404).json({ error: 'game_not_found' })

    // 역할/슬롯 수
    const roles = await getActiveRoles(gameId)
    const needCount = totalSlots(roles)
    if (needCount === 0) return res.status(400).json({ error: 'no_active_roles' })
    if (heroIds.length !== needCount) return res.status(400).json({ error: 'hero_slot_mismatch', need: needCount })

    // 상대 후보 조회 & 슬롯별로 “다른 참가자들”에서 픽
    const candidates = await getOpponentCandidates(gameId, user.id, 100)
    const oppPicks = pickOpponentsPerSlots({ roles, candidates, myHeroIds: heroIds })
    const oppHeroIds = oppPicks.map(p => p.hero_id).filter(Boolean)
    const oppOwnerIds = Array.from(new Set(oppPicks.map(p => p.from_owner).filter(Boolean)))

    // 히어로 상세 로딩
    const heroesMap = await loadHeroesMap([...heroIds, ...oppHeroIds])
    const slotsMap = buildSlotsMap({ myHeroIds: heroIds, oppPicks, heroesMap })

    // 시작 템플릿(세트의 slot_no=1 가정, 필요시 “시작 슬롯” 컬럼으로 확장)
    const { data: startSlot } = await supabase
      .from('prompt_slots')
      .select('template')
      .eq('set_id', game.prompt_set_id)
      .order('slot_no', { ascending: true })
      .limit(1).maybeSingle()

    const tpl = startSlot?.template || '상대와 전투를 시뮬레이션하라.'
    const { text: prompt } = compileTemplate({ template: tpl, slotsMap, historyText: '' })

    // AI 호출(유저 키)
    const ai = await callChat({
      userApiKey,
      system: '당신은 비동기 PvE 랭킹 전투의 심판/해설자 겸 시뮬레이터입니다.',
      user: prompt
    })
    if (ai.error) {
      // 쿼터/에러 → 저장하지 않고 종료, 재시도 가능
      return res.status(200).json(ai)
    }

    // 판정
    const { outcome } = judgeOutcome(ai.text)
    const delta = outcome === 'win' ? game.score_win
                : outcome === 'lose' ? game.score_loss
                : game.score_draw

    // 기록 및 점수 반영
    const record = await recordBattle({
      game,
      userId: user.id,
      myHeroIds: heroIds,
      oppOwnerIds,
      oppHeroIds,
      outcome,
      delta,
      prompt,
      aiText: ai.text,
      turnLogs: [
        {
          turn_no: 1,
          prompt,
          ai_response: ai.text,
          meta: { outcome, mode: 'auto' },
        },
      ],
    })

    return res.status(200).json({
      ok: true,
      outcome,
      delta,
      battleId: record.battleId,
      text: ai.text,
      participantStatus: {
        attacker: record.attackerStatus,
        defender: record.defenderStatus,
        defenderOwners: record.defenderOwners,
      },
    })
  } catch (e) {
    return res.status(500).json({ error: 'server_error', detail: String(e).slice(0, 300) })
  }
}
