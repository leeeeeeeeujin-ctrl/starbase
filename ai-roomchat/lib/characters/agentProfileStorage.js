import {
  HERO_ARCHIVE_ENTRY_MAX_LENGTH,
  HERO_ARCHIVE_MAX,
  HERO_CHAT_INPUT_MAX_LENGTH,
  HERO_MEMORY_ENTRY_MAX_LENGTH,
  HERO_MEMORY_SLOT_MAX,
  HERO_RECENT_CHAT_MAX,
} from './profileRules';

const PREFIX = 'hero-agent-profile:';

const clampText = (value, limit) => String(value || '').trim().slice(0, limit);

function getKey(heroId) {
  return `${PREFIX}${heroId}`;
}

function collapseLines(values, limit, prefix = '') {
  const text = values
    .map(value => clampText(value, limit))
    .filter(Boolean)
    .join(prefix ? `\n${prefix}` : '\n');
  return clampText(prefix && text ? `${prefix}${text}` : text, limit);
}

function buildRuntimeCache(profile) {
  const memories = Array.isArray(profile.memories) ? profile.memories : [];
  const recentChats = Array.isArray(profile.recentChats) ? profile.recentChats : [];
  const archives = Array.isArray(profile.archives) ? profile.archives : [];
  const recentBehavior = recentChats
    .slice(-4)
    .map(entry => `${entry.role === 'assistant' ? 'AI' : 'USER'}: ${entry.text}`);
  const stableMemory = memories
    .slice(-4)
    .map((entry, index) => `${index + 1}. ${entry.text}`);
  const tacticalMemory = memories
    .slice(-2)
    .map((entry, index) => `${index + 1}. ${entry.text}`);
  const archiveEntries = archives
    .slice(-2)
    .map((entry, index) => `${index + 1}. ${entry.summary}`);

  return {
    personaSummary: collapseLines(
      [
        profile.systemPrompt ? `기본: ${profile.systemPrompt}` : '',
        profile.speakingStyle ? `말투: ${profile.speakingStyle}` : '',
        profile.behaviorRules ? `원칙: ${profile.behaviorRules}` : '',
      ],
      900
    ),
    memorySummary: collapseLines(stableMemory, 900),
    recentSummary: collapseLines(
      recentChats
        .slice(-8)
        .map(entry => `${entry.role === 'assistant' ? 'AI' : 'USER'}: ${entry.text}`),
      1000
    ),
    archiveSummary: collapseLines(archiveEntries, 700),
    dialogSummary: collapseLines(
      [
        profile.systemPrompt ? `기본: ${profile.systemPrompt}` : '',
        profile.speakingStyle ? `말투: ${profile.speakingStyle}` : '',
        profile.behaviorRules ? `원칙: ${profile.behaviorRules}` : '',
        stableMemory.length ? `핵심 기억:\n${stableMemory.join('\n')}` : '',
        recentBehavior.length ? `최근 대화:\n${recentBehavior.join('\n')}` : '',
        archiveEntries.length ? `장기 요약:\n${archiveEntries.join('\n')}` : '',
      ],
      1800
    ),
    gameSummary: collapseLines(
      [
        profile.systemPrompt ? `기본: ${profile.systemPrompt}` : '',
        profile.speakingStyle ? `말투: ${profile.speakingStyle}` : '',
        profile.behaviorRules ? `원칙: ${profile.behaviorRules}` : '',
        tacticalMemory.length ? `전투 기억:\n${tacticalMemory.join('\n')}` : '',
        archiveEntries.length ? `장기 요약:\n${archiveEntries.join('\n')}` : '',
      ],
      1300
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function readHeroAgentProfile(heroId) {
  if (typeof window === 'undefined' || !heroId) return null;
  try {
    const raw = window.localStorage.getItem(getKey(heroId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return sanitizeHeroAgentProfile(parsed);
  } catch (error) {
    console.error('[HeroAgent] Failed to read profile:', error);
    return null;
  }
}

export function writeHeroAgentProfile(heroId, value) {
  if (typeof window === 'undefined' || !heroId) return;
  try {
    const sanitized = sanitizeHeroAgentProfile(value);
    window.localStorage.setItem(getKey(heroId), JSON.stringify(sanitized));
  } catch (error) {
    console.error('[HeroAgent] Failed to write profile:', error);
  }
}

export function sanitizeHeroAgentProfile(profile = {}) {
  const archives = Array.isArray(profile.archives) ? profile.archives : [];
  const memories = Array.isArray(profile.memories) ? profile.memories : [];
  const recentChats = Array.isArray(profile.recentChats) ? profile.recentChats : [];

  const sanitized = {
    systemPrompt: clampText(profile.systemPrompt || '', 2000),
    speakingStyle: clampText(profile.speakingStyle || '', 400),
    behaviorRules: clampText(profile.behaviorRules || '', 1000),
    archives: archives
      .map((entry, index) => ({
        id: entry?.id || `archive-${Date.now()}-${index}`,
        summary: clampText(entry?.summary || '', HERO_ARCHIVE_ENTRY_MAX_LENGTH),
        createdAt: entry?.createdAt || new Date().toISOString(),
      }))
      .filter(entry => entry.summary)
      .slice(-HERO_ARCHIVE_MAX),
    memories: memories
      .map((entry, index) => ({
        id: entry?.id || `memory-${Date.now()}-${index}`,
        text: clampText(entry?.text || '', HERO_MEMORY_ENTRY_MAX_LENGTH),
        updatedAt: entry?.updatedAt || new Date().toISOString(),
      }))
      .filter(entry => entry.text)
      .slice(0, HERO_MEMORY_SLOT_MAX),
    recentChats: recentChats
      .map((entry, index) => ({
        id: entry?.id || `chat-${Date.now()}-${index}`,
        role: entry?.role === 'assistant' ? 'assistant' : 'user',
        text: clampText(entry?.text || '', HERO_CHAT_INPUT_MAX_LENGTH),
        createdAt: entry?.createdAt || new Date().toISOString(),
      }))
      .filter(entry => entry.text)
      .slice(-HERO_RECENT_CHAT_MAX),
  };

  sanitized.runtimeCache = buildRuntimeCache(sanitized);
  return sanitized;
}

export function appendRecentChat(profile, message) {
  const next = sanitizeHeroAgentProfile(profile);
  const appended = [...next.recentChats, message];
  const overflowCount = Math.max(0, appended.length - HERO_RECENT_CHAT_MAX);
  if (overflowCount > 0) {
    const overflow = appended.slice(0, overflowCount);
    const summary = overflow
      .map(entry => `${entry.role === 'assistant' ? 'AI' : 'USER'}: ${entry.text}`)
      .join(' / ');
    if (summary) {
      next.archives = [
        ...next.archives,
        {
          id: `archive-${Date.now()}`,
          summary: clampText(summary, HERO_ARCHIVE_ENTRY_MAX_LENGTH),
          createdAt: new Date().toISOString(),
        },
      ].slice(-HERO_ARCHIVE_MAX);
    }
  }
  next.recentChats = appended.slice(-HERO_RECENT_CHAT_MAX);
  return next;
}

export function applyMemoryAction(profile, action) {
  const next = sanitizeHeroAgentProfile(profile);
  if (!action || typeof action !== 'object') return next;

  const type = String(action.type || 'none').toLowerCase();
  if (type === 'none') return next;

  const index = Number.isInteger(action.index) ? action.index : -1;
  const text = clampText(action.text || '', HERO_MEMORY_ENTRY_MAX_LENGTH);

  if (type === 'delete') {
    if (index >= 0 && index < next.memories.length) {
      next.memories.splice(index, 1);
    }
    return next;
  }

  if (!text) return next;

  if (type === 'update') {
    if (index >= 0 && index < next.memories.length) {
      next.memories[index] = {
        ...next.memories[index],
        text,
        updatedAt: new Date().toISOString(),
      };
      return next;
    }
  }

  if (type === 'add' || type === 'update') {
    if (next.memories.length >= HERO_MEMORY_SLOT_MAX) {
      next.memories.shift();
    }
    next.memories.push({
      id: `memory-${Date.now()}`,
      text,
      updatedAt: new Date().toISOString(),
    });
  }

  return next;
}
