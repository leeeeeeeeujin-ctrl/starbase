export async function getCodeContext() {
  const res = await fetch('/api/ai/code-context');
  if (!res.ok) throw new Error(`code-context ${res.status}`);
  return res.json();
}

export function buildSystemPromptFromContext(ctx) {
  const parts = [];
  parts.push('You are an assistant writing game plugins for this platform.');
  parts.push('Follow the GameAdapter interface and use provided runtime features.');
  parts.push('Key docs and samples excerpted below. Use them for correctness.');
  for (const s of (ctx.sections || []).slice(0, 12)) {
    parts.push(`\n=== ${s.path} ===\n${s.content}`);
  }
  parts.push('\nAvailable sample files:');
  const sampleList = (ctx.samples || []).slice(0, 50).map((p) => `- ${p}`).join('\n');
  parts.push(sampleList);
  return parts.join('\n');
}

