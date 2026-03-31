// pages/api/rank/play.js
import { supabase } from '@/lib/rank/db';
import { getActiveRoles, totalSlots } from '@/lib/rank/roles';
import { getOpponentCandidates, pickOpponentsPerSlots } from '@/lib/rank/participants';
import { loadHeroesMap, buildSlotsMap } from '@/lib/rank/heroes';
import { compileTemplate } from '@/lib/rank/prompt';
import { callChat } from '@/lib/rank/ai';
import { judgeOutcome } from '@/lib/rank/judge';
import { recordBattle } from '@/lib/rank/persist';
import { fetchUserApiKey, upsertUserApiKey } from '@/lib/rank/userApiKeys';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { buildHeroGameContext } from '@/lib/characters/agentContext';

function buildHeroSummaryFromSlot(slot = {}) {
  return {
    name: slot.name || slot.display_name || '이름 없는 캐릭터',
    description: slot.description || '',
    abilities: Array.from({ length: 12 }, (_, index) => slot[`ability${index + 1}`]).filter(Boolean),
  };
}

function buildProfileFromSlot(slot = {}) {
  const profile =
    slot.agent_profile && typeof slot.agent_profile === 'object'
      ? slot.agent_profile
      : slot.agentProfile && typeof slot.agentProfile === 'object'
        ? slot.agentProfile
        : {};

  return {
    systemPrompt: profile.systemPrompt || '',
    speakingStyle: profile.speakingStyle || '',
    behaviorRules: profile.behaviorRules || '',
    memories: Array.isArray(profile.memories) ? profile.memories : [],
    recentChats: Array.isArray(profile.recentChats) ? profile.recentChats : [],
    archives: Array.isArray(profile.archives) ? profile.archives : [],
    runtimeCache:
      profile.runtimeCache && typeof profile.runtimeCache === 'object' ? profile.runtimeCache : {},
  };
}

function buildParticipantPromptForSlot(slotNo, slotsMap = {}) {
  return Object.entries(slotsMap)
    .filter(([entrySlotNo]) => Number(entrySlotNo) !== Number(slotNo))
    .map(([, entry]) => {
      const summary = buildHeroSummaryFromSlot(entry);
      return [
        summary.name,
        entry?.side ? `진영: ${entry.side}` : '',
        entry?.role ? `역할: ${entry.role}` : '',
        summary.description ? `설명: ${summary.description}` : '',
        summary.abilities.length ? `능력: ${summary.abilities.join(' / ')}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
    })
    .filter(Boolean)
    .join('\n');
}

function buildAgentContexts(slotsMap = {}, gamePrompt = '') {
  return Object.entries(slotsMap)
    .map(([slotNo, slot]) => {
      const summary = buildHeroSummaryFromSlot(slot);
      return {
        slotNo: Number(slotNo),
        name: summary.name,
        context: buildHeroGameContext({
          heroSummary: summary,
          profile: buildProfileFromSlot(slot),
          gamePrompt,
          participantPrompt: buildParticipantPromptForSlot(slotNo, slotsMap),
        }),
      };
    })
    .filter(entry => entry.context);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    const user = userData?.user || null;
    if (userError || !user) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const {
      gameId,
      heroIds = [],
      userApiKey,
      apiVersion = 'gemini',
      geminiMode,
      geminiModel,
    } = req.body || {};

    const trimmedApiKey = typeof userApiKey === 'string' ? userApiKey.trim() : '';
    const providedGeminiMode = typeof geminiMode === 'string' ? geminiMode.trim() : '';
    const providedGeminiModel = typeof geminiModel === 'string' ? geminiModel.trim() : '';

    if (trimmedApiKey) {
      try {
        await upsertUserApiKey({
          userId: user.id,
          apiKey: trimmedApiKey,
          apiVersion,
          geminiMode: providedGeminiMode,
          geminiModel: providedGeminiModel,
        });
      } catch (error) {
        console.warn('[play] Failed to persist API key:', error);
      }
    }

    let effectiveApiKey = trimmedApiKey;
    let effectiveApiVersion = apiVersion;
    let effectiveGeminiMode = providedGeminiMode;
    let effectiveGeminiModel = providedGeminiModel;

    if (!effectiveApiKey) {
      try {
        const stored = await fetchUserApiKey(user.id);
        if (stored?.apiKey) {
          effectiveApiKey = stored.apiKey;
          if (!effectiveApiVersion && stored.apiVersion) {
            effectiveApiVersion = stored.apiVersion;
          }
          if (!effectiveGeminiMode && stored.geminiMode) {
            effectiveGeminiMode = stored.geminiMode;
          }
          if (!effectiveGeminiModel && stored.geminiModel) {
            effectiveGeminiModel = stored.geminiModel;
          }
        }
      } catch (error) {
        console.warn('[play] Failed to load stored API key:', error);
      }
    }

    if (!effectiveApiKey) {
      return res.status(400).json({ error: 'missing_user_api_key' });
    }

    // 게임 메타
    const { data: game, error: gerr } = await supabase
      .from('rank_games')
      .select('*')
      .eq('id', gameId)
      .single();
    if (gerr || !game) return res.status(404).json({ error: 'game_not_found' });

    // 역할/슬롯 수
    const roles = await getActiveRoles(gameId);
    const needCount = totalSlots(roles);
    if (needCount === 0) return res.status(400).json({ error: 'no_active_roles' });
    if (heroIds.length !== needCount)
      return res.status(400).json({ error: 'hero_slot_mismatch', need: needCount });

    // 상대 후보 조회 & 슬롯별로 “다른 참가자들”에서 픽
    const candidates = await getOpponentCandidates(gameId, user.id, 100);
    const oppPicks = pickOpponentsPerSlots({ roles, candidates, myHeroIds: heroIds });
    const oppHeroIds = oppPicks.map(p => p.hero_id).filter(Boolean);
    const oppOwnerIds = Array.from(new Set(oppPicks.map(p => p.from_owner).filter(Boolean)));

    // 히어로 상세 로딩
    const heroesMap = await loadHeroesMap([...heroIds, ...oppHeroIds]);
    const slotsMap = buildSlotsMap({ roles, myHeroIds: heroIds, oppPicks, heroesMap });

    // 시작 템플릿(세트의 slot_no=1 가정, 필요시 “시작 슬롯” 컬럼으로 확장)
    const { data: startSlot } = await supabase
      .from('prompt_slots')
      .select('template')
      .eq('set_id', game.prompt_set_id)
      .order('slot_no', { ascending: true })
      .limit(1)
      .maybeSingle();

    const tpl = startSlot?.template || '상대와 전투를 시뮬레이션하라.';
    const { text: prompt } = compileTemplate({ template: tpl, slotsMap, historyText: '' });
    const agentContexts = buildAgentContexts(slotsMap, prompt);
    const runtimePrompt = [
      agentContexts.length ? '아래는 각 참가 캐릭터 AI의 게임 실행 문맥이다.' : '',
      ...agentContexts.map(
        entry => `[슬롯 ${entry.slotNo + 1}: ${entry.name}]\n${entry.context}`
      ),
      '아래 템플릿 지시를 우선해 전투를 시뮬레이션하고 결과를 서술하라.',
      prompt,
    ]
      .filter(Boolean)
      .join('\n\n----------------\n\n');

    // AI 호출(유저 키)
    const ai = await callChat({
      userApiKey: effectiveApiKey,
      system:
        '당신은 비동기 PvE 랭킹 전투의 심판/해설자 겸 시뮬레이터입니다. 참가 캐릭터의 설정, 능력, 기억 요약을 반영해 전투를 전개하되 과도한 잡담보다 행동과 결과를 우선합니다.',
      user: runtimePrompt,
      apiVersion: effectiveApiVersion || 'gemini',
      providerOptions:
        (effectiveApiVersion || 'gemini') === 'gemini'
          ? { geminiMode: effectiveGeminiMode, geminiModel: effectiveGeminiModel }
          : {},
    });
    if (ai.error) {
      // 쿼터/에러 → 저장하지 않고 종료, 재시도 가능
      return res.status(200).json(ai);
    }

    // 판정
    const { outcome } = judgeOutcome(ai.text);
    const delta =
      outcome === 'win' ? game.score_win : outcome === 'lose' ? game.score_loss : game.score_draw;

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
    });

    return res.status(200).json({
      ok: true,
      outcome,
      delta,
      battleId: record.battleId,
      text: ai.text,
      agentContexts,
      participantStatus: {
        attacker: record.attackerStatus,
        defender: record.defenderStatus,
        defenderOwners: record.defenderOwners,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', detail: String(e).slice(0, 300) });
  }
}
