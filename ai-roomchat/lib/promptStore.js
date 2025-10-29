// In-memory prompt store for local development/demo. Not persistent across restarts.
const prompts = new Map();
const runs = new Map();

function listPrompts() {
  return Array.from(prompts.values());
}

function getPrompt(id) {
  return prompts.get(id);
}

function savePrompt(prompt) {
  const now = new Date().toISOString();
  const existing = prompts.get(prompt.id) || null;
  const version = existing ? existing.version + 1 : 1;
  const record = {
    id: prompt.id || String(Math.random()).slice(2, 10),
    name: prompt.name || 'untitled',
    body: prompt.body || '',
    format: prompt.format || 'template',
    metadata: prompt.metadata || {},
    version,
    created_by: prompt.created_by || 'local',
    created_at: existing ? existing.created_at : now,
    updated_at: now,
  };
  prompts.set(record.id, record);
  return record;
}

function saveRun(run) {
  const id = 'run-' + String(Math.random()).slice(2, 10);
  const record = Object.assign({ id, created_at: new Date().toISOString() }, run);
  runs.set(id, record);
  return record;
}

function listRunsForPrompt(promptId) {
  return Array.from(runs.values()).filter(r => r.prompt_id === promptId);
}

module.exports = { listPrompts, getPrompt, savePrompt, saveRun, listRunsForPrompt };
