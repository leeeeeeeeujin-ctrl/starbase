// AI Orchestration Starter (오디언스/타임아웃 포함)
// 참고: lib/game/ai/AIOrchestrator.js, lib/game/ai/template.js, components/game/chat/*

import { createAIOrchestrator } from '../../../lib/game/ai/AIOrchestrator.js';
import { buildAudience } from '../../../lib/game/ai/template.js';

export default function createAIChat({}){
  let el, ai;
  return {
    init(container, ctx){ el=container; ai = createAIOrchestrator({ aiAdapter: ctx?.network?.aiAdapter || null, chat: ctx?.chat || { post:()=>{} }, network: ctx?.network, sessionId: ctx?.sessionId, gameId: ctx?.gameId }); },
    start(){}, stop(){}, dispose(){},
    async onInput(ev){ if(ev.type==='keydown' && ev.key==='Enter'){ const audience = buildAudience({ roles:['player'], players:[ev.userId||'u1'] }); await ai.runPrompt({ template: '다음 움직임을 제안해줘: {{character.name}}', character: ev.character, audience, timeoutMs: 8000 }); } },
  };
}

