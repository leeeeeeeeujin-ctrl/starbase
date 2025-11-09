// Text Scene + AI Judge Starter
// 참고: lib/game/text/TextSceneEngine.js, lib/game/ai/AIOrchestrator.js

import { createTextEngine } from '../../../lib/game/text/TextSceneEngine.js';
import { createAIOrchestrator } from '../../../lib/game/ai/AIOrchestrator.js';

export default function createTextJudge({ script, onRender }){
  let engine, ai, ctxRef;
  return {
    init(container, ctx){ ctxRef = ctx; engine = createTextEngine(script || { start:'intro', nodes:{ intro:{ text:'{{character.name}}의 턴입니다.', choices:[{ label:'공격', to:'attack' }] }, attack:{ text:'공격!', choices:[] } } }, { name: ctx?.character?.name||'Hero' }); ai = createAIOrchestrator({ aiAdapter: ctx?.network?.aiAdapter || null, chat: ctx?.chat || { post:()=>{} }, network: ctx?.network, sessionId: ctx?.sessionId, gameId: ctx?.gameId }); onRender && onRender(engine.current(), container); engine.subscribe((cur)=> onRender && onRender(cur, container)); },
    start(){}, stop(){}, dispose(){},
    async onInput(ev){ if (ev.type==='keydown' && ev.key==='Enter'){ await ai.runPrompt({ template:'{{character.name}}의 공격 성공 여부를 판정해줘.', character: ctxRef?.character, audience:['all'], timeoutMs:7000 }); } },
  };
}

