// Coordinates AI-driven gameplay via chat + prompts.
// Uses AIAdapter to invoke LLM, publishes to InGameChatProvider channels with audience masks.

import { renderPrompt, buildAudience } from "./template.js";

export function createAIOrchestrator({ aiAdapter, chat, network, sessionId, gameId }) {
  if (!aiAdapter) throw new Error("AIOrchestrator requires aiAdapter");
  if (!chat) throw new Error("AIOrchestrator requires chat provider");

  async function runPrompt({ template, common = {}, character, session = {}, game = {}, audience, channel = "ai", timeoutMs = 15000, meta = {} }) {
    const prompt = renderPrompt({ template, common, character, session, game });
    const aud = Array.isArray(audience) ? audience : buildAudience({ all: true });
    const started = Date.now();
    const msgMeta = { ...meta, audience: aud, kind: "ai:prompt" };
    chat.post(channel, prompt, msgMeta);
    let timeoutId;
    const to = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error("timeout")), timeoutMs); });
    try {
      const result = await Promise.race([aiAdapter.invoke({ prompt, sessionId, gameId }), to]);
      clearTimeout(timeoutId);
      const took = Date.now() - started;
      const respMeta = { ...meta, audience: aud, kind: "ai:response", tookMs: took };
      chat.post(channel, String(result?.text ?? result ?? ""), respMeta);
      try { network?.send?.("event", { type: "ai:response", payload: { took, channel } }); } catch {}
      return result;
    } catch (err) {
      clearTimeout(timeoutId);
      const errMeta = { ...meta, audience: aud, kind: "ai:error", error: String(err) };
      chat.post(channel, "[AI 응답 실패]", errMeta);
      throw err;
    }
  }

  return Object.freeze({ runPrompt });
}

