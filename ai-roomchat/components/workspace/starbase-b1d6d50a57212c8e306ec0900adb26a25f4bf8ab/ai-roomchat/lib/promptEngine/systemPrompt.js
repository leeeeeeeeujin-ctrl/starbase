import { safeStr } from './utils';

export function buildSystemPromptFromChecklist(rules = {}) {
  const out = [];
  const checklist = Array.isArray(rules.checklist) ? rules.checklist : [];

  for (const item of checklist) {
    const line = safeStr(item.text);
    if (!line) continue;
    if (item.mandatory) out.push(`(필수) ${line}`);
    else out.push(line);
  }

  return out.join('\n');
}
