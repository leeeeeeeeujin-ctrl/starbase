// lib/engineRunner.js
import { compileTemplate } from '@/lib/promptEngine';

/** 엔진 입력 파라미터
 * setGraph: { slots: [{id, slot_no, slot_type, template}], bridges: [...] }
 * slotsPayload: {1..12: { name, description, ability1..4, image_url }}
 * history: { joinedText({last, onlyPublic}): string }
 * callModel: async ({system,user}) => ({ ok, text, tokenUsed, finishReason, error })
 * bridgeEval: ({ bridgesFromSlot, aiText, prevPrompt, ctx }) => { nextSlotId | null, action }
 */
export async function runOneTurn({
  setGraph,
  currentSlotId,
  slotsPayload,
  history,
  callModel,
  bridgeEval,
}) {
  const curr = setGraph.slots.find(s => s.id === currentSlotId);
  if (!curr) return { error: '현재 슬롯을 찾을 수 없음' };

  // 1) 프롬프트 생성
  const compiled = compileTemplate({
    template: curr.template || '',
    slots: slotsPayload,
    historyText: history.joinedText({ last: 10, onlyPublic: false }),
  });
  const userPrompt = compiled.text;

  // 2) 모델 호출(시스템 프롬프트는 외부에서 구성해서 넘겨줄 것)
  const res = await callModel({ user: userPrompt });
  if (!res.ok) return { error: res.error || '모델 호출 실패', tokenUsed: res.tokenUsed ?? 0 };

  // 3) 브릿지 평가 → 다음 슬롯
  const bridgesFromHere = (setGraph.bridges || []).filter(b => b.from_slot_id === currentSlotId);
  const next = bridgeEval({
    bridgesFromSlot: bridgesFromHere,
    aiText: res.text,
    prevPrompt: userPrompt,
    ctx: { slotsPayload, pickSlotFromTemplateMeta: compiled.meta },
  });

  return {
    ok: true,
    aiText: res.text,
    nextSlotId: next?.nextSlotId ?? null,
    action: next?.action ?? 'continue',
    tokenUsed: res.tokenUsed ?? 0,
  };
}
