import {
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
  const memories = Array.isArray(profile.memories) ? profile.memories : [];
  const recentChats = Array.isArray(profile.recentChats) ? profile.recentChats : [];

  return {
    systemPrompt: clampText(profile.systemPrompt || '', 2000),
    speakingStyle: clampText(profile.speakingStyle || '', 400),
    behaviorRules: clampText(profile.behaviorRules || '', 1000),
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
}

export function appendRecentChat(profile, message) {
  const next = sanitizeHeroAgentProfile(profile);
  next.recentChats = [...next.recentChats, message].slice(-HERO_RECENT_CHAT_MAX);
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
