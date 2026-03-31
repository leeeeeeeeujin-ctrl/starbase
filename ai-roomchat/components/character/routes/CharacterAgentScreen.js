'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { withTable } from '@/lib/supabaseTables';
import { buildHeroAgentPrompt } from '@/lib/characters/agentContext';
import {
  appendRecentChat,
  applyMemoryAction,
  readHeroAgentProfile,
  sanitizeHeroAgentProfile,
  writeHeroAgentProfile,
} from '@/lib/characters/agentProfileStorage';
import {
  clampHeroProfileDraft,
  HERO_ABILITY_MAX_LENGTH,
  HERO_ARCHIVE_MAX,
  HERO_CHAT_INPUT_MAX_LENGTH,
  HERO_DESCRIPTION_MAX_LENGTH,
  HERO_MEMORY_ENTRY_MAX_LENGTH,
  HERO_MEMORY_SLOT_MAX,
  HERO_NAME_MAX_LENGTH,
  HERO_RECENT_CHAT_MAX,
  normalizeHeroProfilePayload,
  validateHeroProfileDraft,
} from '@/lib/characters/profileRules';

const INITIAL_PROFILE = {
  systemPrompt: '',
  speakingStyle: '',
  behaviorRules: '',
  memories: [],
  recentChats: [],
  archives: [],
};

const INITIAL_HERO_DRAFT = {
  name: '',
  description: '',
  ability1: '',
  ability2: '',
  ability3: '',
  ability4: '',
};

export default function CharacterAgentScreen({ hero }) {
  const heroId = hero?.id ? String(hero.id) : '';
  const heroImage = hero?.image_url || hero?.background_url || '';
  const [profile, setProfile] = useState(INITIAL_PROFILE);
  const [heroDraft, setHeroDraft] = useState(INITIAL_HERO_DRAFT);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('profile');
  const [hasActiveApiKey, setHasActiveApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiSubmitting, setApiSubmitting] = useState(false);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!heroId) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    const stored = readHeroAgentProfile(heroId);
    setProfile(stored || INITIAL_PROFILE);
    setHeroDraft(
      clampHeroProfileDraft({
        name: hero?.name || '',
        description: hero?.description || '',
        ability1: hero?.ability1 || '',
        ability2: hero?.ability2 || '',
        ability3: hero?.ability3 || '',
        ability4: hero?.ability4 || '',
      })
    );
    setInput('');
    setStatus('');
    setSaveStatus('');
    setLoading(false);
  }, [hero?.ability1, hero?.ability2, hero?.ability3, hero?.ability4, hero?.description, hero?.name, heroId]);

  useEffect(
    () => () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    },
    []
  );

  const syncKeyState = useCallback(async () => {
    const sessionResult = await supabase.auth.getSession();
    const token = sessionResult?.data?.session?.access_token || '';
    if (!token) {
      setHasActiveApiKey(false);
      return null;
    }
    const response = await fetch('/api/rank/user-api-keyring', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setHasActiveApiKey(false);
      return payload;
    }
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    setHasActiveApiKey(entries.some(entry => entry?.isActive));
    return payload;
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        await syncKeyState();
      } catch {
        if (mounted) setHasActiveApiKey(false);
      }
    };
    run();
    const handleRefresh = () => {
      syncKeyState().catch(() => {});
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('rank-keyring:refresh', handleRefresh);
    }
    return () => {
      mounted = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('rank-keyring:refresh', handleRefresh);
      }
    };
  }, [syncKeyState]);

  const persistProfile = useCallback(
    next => {
      const sanitized = sanitizeHeroAgentProfile(next);
      setProfile(sanitized);
      if (heroId) {
        writeHeroAgentProfile(heroId, sanitized);
      }
      return sanitized;
    },
    [heroId]
  );

  const profileSummary = useMemo(
    () => ({
      name: heroDraft.name || hero?.name || '이름 없는 캐릭터',
      description: heroDraft.description || hero?.description || '',
      abilities: [heroDraft.ability1, heroDraft.ability2, heroDraft.ability3, heroDraft.ability4].filter(Boolean),
    }),
    [
      hero?.description,
      hero?.name,
      heroDraft.ability1,
      heroDraft.ability2,
      heroDraft.ability3,
      heroDraft.ability4,
      heroDraft.description,
      heroDraft.name,
    ]
  );

  const buildPrompt = useCallback(
    userInput =>
      buildHeroAgentPrompt({
        heroSummary: profileSummary,
        profile,
        userInput,
      }),
    [profile, profileSummary]
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || !heroId) return;
    if (!hasActiveApiKey) {
      setStatus('활성 API 키가 필요합니다.');
      setPanelOpen(true);
      setActiveSection('api');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = Date.now();
    requestIdRef.current = requestId;

    setLoading(true);
    setStatus(loading ? '이전 응답을 취소하고 새 질문을 보냈습니다.' : '');

    const userMessage = {
      id: `chat-${requestId}-user`,
      role: 'user',
      text,
      createdAt: new Date().toISOString(),
    };

    const nextProfile = persistProfile(appendRecentChat(profile, userMessage));
    setInput('');

    try {
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult?.data?.session?.access_token || '';
      if (!token) {
        throw new Error('로그인이 필요합니다.');
      }

      const response = await fetch('/api/chat/ai-proxy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: buildPrompt(text),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'AI 응답을 불러오지 못했습니다.');
      }

      let parsed;
      try {
        parsed = JSON.parse(data?.text || '{}');
      } catch {
        parsed = { reply: data?.text || '', memoryAction: { type: 'none' } };
      }

      const assistantMessage = {
        id: `chat-${requestId}-assistant`,
        role: 'assistant',
        text: String(parsed?.reply || data?.text || '').slice(0, HERO_CHAT_INPUT_MAX_LENGTH),
        createdAt: new Date().toISOString(),
      };

      if (requestIdRef.current !== requestId) {
        return;
      }

      let updatedProfile = appendRecentChat(nextProfile, assistantMessage);
      updatedProfile = applyMemoryAction(updatedProfile, parsed?.memoryAction);
      persistProfile(updatedProfile);

      if (parsed?.memoryAction?.type && parsed.memoryAction.type !== 'none') {
        setStatus('메모리가 갱신되었습니다.');
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        if (requestIdRef.current === requestId) {
          setStatus('응답을 취소했습니다.');
        }
        return;
      }
      console.error('[CharacterAgent] chat failed', error);
      setStatus(error.message || '대화를 처리하지 못했습니다.');
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
        abortControllerRef.current = null;
      }
    }
  }, [buildPrompt, hasActiveApiKey, heroId, input, loading, persistProfile, profile]);

  const handleSaveHero = useCallback(async () => {
    if (!heroId) return;
    const clamped = clampHeroProfileDraft(heroDraft);
    const errors = validateHeroProfileDraft(clamped);
    if (errors.length) {
      setSaveStatus(errors[0]);
      return;
    }

    const payload = normalizeHeroProfilePayload(clamped, hero?.name || '이름 없는 영웅');
    setSaveStatus('저장 중…');
    try {
      const { error } = await supabase
        .from(withTable('heroes'))
        .update(payload)
        .eq('id', heroId);
      if (error) throw error;
      setHeroDraft(clampHeroProfileDraft(payload));
      setSaveStatus('캐릭터 정보를 저장했습니다.');
    } catch (error) {
      console.error('[CharacterAgent] failed to save hero profile', error);
      setSaveStatus(error.message || '캐릭터 정보를 저장하지 못했습니다.');
    }
  }, [hero?.name, heroDraft, heroId]);

  const handleRegisterApiKey = useCallback(async () => {
    const apiKey = apiKeyInput.trim();
    if (!apiKey || apiSubmitting) return;
    setApiSubmitting(true);
    setSaveStatus('');
    try {
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult?.data?.session?.access_token || '';
      if (!token) {
        throw new Error('로그인이 필요합니다.');
      }
      const response = await fetch('/api/rank/user-api-keyring', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          apiKey,
          activate: true,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'API 키를 저장하지 못했습니다.');
      }
      setApiKeyInput('');
      setSaveStatus(payload?.deduped ? '기존 키를 다시 활성화했습니다.' : 'API 키를 저장했습니다.');
      await syncKeyState();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('rank-keyring:refresh'));
      }
    } catch (error) {
      console.error('[CharacterAgent] failed to register api key', error);
      setSaveStatus(error.message || 'API 키를 저장하지 못했습니다.');
    } finally {
      setApiSubmitting(false);
    }
  }, [apiKeyInput, apiSubmitting, syncKeyState]);

  const sectionButtons = [
    { key: 'profile', label: '캐릭터' },
    { key: 'prompt', label: '프롬프트' },
    { key: 'memory', label: '기억' },
    { key: 'api', label: 'API 키' },
  ];

  return (
    <div style={styles.page}>
      <section style={styles.chatCard}>
        <div style={styles.chatBackdrop(heroImage)} aria-hidden="true" />
        <div style={styles.chatInner}>
          <div style={styles.chatHeader}>
            <div style={styles.identityRow}>
              <div style={styles.avatarShell}>
                {heroImage ? (
                  <img src={heroImage} alt={profileSummary.name} style={styles.avatarImage} />
                ) : (
                  <div style={styles.avatarFallback}>{profileSummary.name.slice(0, 2)}</div>
                )}
              </div>
              <div style={styles.identityText}>
                <strong style={styles.identityName}>{profileSummary.name}</strong>
                <span style={styles.identityMeta}>
                  {hasActiveApiKey ? '활성 API 키 연결됨' : '활성 API 키 필요'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPanelOpen(prev => !prev)}
              style={styles.headerAction}
            >
              {panelOpen ? '패널 접기' : '패널 펼치기'}
            </button>
          </div>

          <div style={styles.chatLog}>
            {profile.recentChats.length ? (
              <>
                {profile.recentChats.map(entry => (
                  <div
                    key={entry.id}
                    style={styles.messageBubble(entry.role === 'assistant')}
                  >
                    {entry.text}
                  </div>
                ))}
                {loading ? <div style={styles.loadingBubble}>...</div> : null}
              </>
            ) : (
              <div style={styles.emptyState}>아직 대화가 없습니다.</div>
            )}
          </div>

          <div style={styles.inputArea}>
            <textarea
              value={input}
              maxLength={HERO_CHAT_INPUT_MAX_LENGTH}
              onChange={event => setInput(event.target.value)}
              placeholder="캐릭터와 대화하듯 입력합니다."
              style={styles.inputBox}
            />
            <div style={styles.inputMetaRow}>
              <span style={styles.metaText}>{`${input.length}/${HERO_CHAT_INPUT_MAX_LENGTH}`}</span>
              {status ? <span style={styles.statusText}>{status}</span> : null}
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || !hasActiveApiKey}
                style={styles.sendButton(!input.trim() || !hasActiveApiKey)}
              >
                {loading ? '응답 중…' : hasActiveApiKey ? '보내기' : '키 필요'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div style={styles.panelWrap} data-swipe-lock="true">
        <div style={styles.panelToggleRow}>
          <button
            type="button"
            onClick={() => setPanelOpen(prev => !prev)}
            style={styles.panelToggle}
          >
            {panelOpen ? '▼ 패널 접기' : '▲ 패널 펼치기'}
          </button>
        </div>
        {panelOpen ? (
          <section style={styles.panelBody}>
            <div style={styles.sectionTabs}>
              {sectionButtons.map(button => (
                <button
                  key={button.key}
                  type="button"
                  onClick={() => setActiveSection(button.key)}
                  style={styles.sectionTab(activeSection === button.key)}
                >
                  {button.label}
                </button>
              ))}
            </div>

            {activeSection === 'profile' ? (
              <div style={styles.sectionBlock}>
                <Field
                  label={`이름 (${heroDraft.name.length}/${HERO_NAME_MAX_LENGTH})`}
                  element={
                    <input
                      name="hero_name"
                      value={heroDraft.name}
                      maxLength={HERO_NAME_MAX_LENGTH}
                      onChange={event =>
                        setHeroDraft(prev =>
                          clampHeroProfileDraft({
                            ...prev,
                            name: event.target.value,
                          })
                        )
                      }
                      style={styles.textField}
                    />
                  }
                />
                <Field
                  label={`설명 (${heroDraft.description.length}/${HERO_DESCRIPTION_MAX_LENGTH})`}
                  element={
                    <textarea
                      name="hero_description"
                      value={heroDraft.description}
                      maxLength={HERO_DESCRIPTION_MAX_LENGTH}
                      onChange={event =>
                        setHeroDraft(prev =>
                          clampHeroProfileDraft({
                            ...prev,
                            description: event.target.value,
                          })
                        )
                      }
                      style={styles.panelTextArea(110)}
                    />
                  }
                />
                {[1, 2, 3, 4].map(index => {
                  const key = `ability${index}`;
                  const value = heroDraft[key];
                  return (
                    <Field
                      key={key}
                      label={`능력 ${index} (${value.length}/${HERO_ABILITY_MAX_LENGTH})`}
                      element={
                        <textarea
                          name={key}
                          value={value}
                          maxLength={HERO_ABILITY_MAX_LENGTH}
                          onChange={event =>
                            setHeroDraft(prev =>
                              clampHeroProfileDraft({
                                ...prev,
                                [key]: event.target.value,
                              })
                            )
                          }
                          style={styles.panelTextArea(76)}
                        />
                      }
                    />
                  );
                })}
                <button type="button" onClick={handleSaveHero} style={styles.primaryButton}>
                  캐릭터 저장
                </button>
              </div>
            ) : null}

            {activeSection === 'prompt' ? (
              <div style={styles.sectionBlock}>
                <Field
                  label={`기본 프롬프트 (${profile.systemPrompt.length}/2000)`}
                  element={
                    <textarea
                      name="system_prompt"
                      value={profile.systemPrompt}
                      maxLength={2000}
                      onChange={event =>
                        persistProfile({
                          ...profile,
                          systemPrompt: event.target.value,
                        })
                      }
                      style={styles.panelTextArea(120)}
                    />
                  }
                />
                <Field
                  label={`말투 / 어조 (${profile.speakingStyle.length}/400)`}
                  element={
                    <textarea
                      name="speaking_style"
                      value={profile.speakingStyle}
                      maxLength={400}
                      onChange={event =>
                        persistProfile({
                          ...profile,
                          speakingStyle: event.target.value,
                        })
                      }
                      style={styles.panelTextArea(88)}
                    />
                  }
                />
                <Field
                  label={`행동 원칙 (${profile.behaviorRules.length}/1000)`}
                  element={
                    <textarea
                      name="behavior_rules"
                      value={profile.behaviorRules}
                      maxLength={1000}
                      onChange={event =>
                        persistProfile({
                          ...profile,
                          behaviorRules: event.target.value,
                        })
                      }
                      style={styles.panelTextArea(110)}
                    />
                  }
                />
              </div>
            ) : null}

            {activeSection === 'memory' ? (
              <div style={styles.sectionBlock}>
                <div style={styles.summaryLine}>{`최근 대화 ${profile.recentChats.length}/${HERO_RECENT_CHAT_MAX}`}</div>
                <div style={styles.summaryLine}>{`메모리 슬롯 ${profile.memories.length}/${HERO_MEMORY_SLOT_MAX}`}</div>
                <div style={styles.summaryLine}>{`장기 요약 ${profile.archives?.length || 0}/${HERO_ARCHIVE_MAX}`}</div>
                <div style={styles.memoryList}>
                  {profile.memories.length ? (
                    profile.memories.map((entry, index) => (
                      <div key={entry.id} style={styles.memoryCard}>
                        <div style={styles.memoryHeader}>
                          <strong>{`메모리 ${index + 1}`}</strong>
                          <span>{`${entry.text.length}/${HERO_MEMORY_ENTRY_MAX_LENGTH}`}</span>
                        </div>
                        <div style={styles.memoryText}>{entry.text}</div>
                      </div>
                    ))
                  ) : (
                    <div style={styles.emptySmall}>저장된 메모리가 없습니다.</div>
                  )}
                </div>
                <div style={styles.archiveList}>
                  {profile.archives?.slice().reverse().slice(0, 6).map(entry => (
                    <div key={entry.id} style={styles.archiveCard}>
                      <span style={styles.archiveDate}>{new Date(entry.createdAt).toLocaleString('ko-KR')}</span>
                      <div style={styles.archiveText}>{entry.summary}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {activeSection === 'api' ? (
              <div style={styles.sectionBlock}>
                <div style={styles.apiStatusRow}>
                  <strong>현재 상태</strong>
                  <span style={styles.apiBadge(hasActiveApiKey)}>
                    {hasActiveApiKey ? '활성 키 있음' : '활성 키 없음'}
                  </span>
                </div>
                <Field
                  label="새 API 키"
                  element={
                    <input
                      type="password"
                      name="api_key"
                      value={apiKeyInput}
                      onChange={event => setApiKeyInput(event.target.value)}
                      placeholder="새 API 키를 붙여넣습니다."
                      style={styles.textField}
                    />
                  }
                />
                <div style={styles.inlineActions}>
                  <button
                    type="button"
                    onClick={handleRegisterApiKey}
                    disabled={apiSubmitting || !apiKeyInput.trim()}
                    style={styles.primaryButton}
                  >
                    {apiSubmitting ? '저장 중…' : 'API 키 저장'}
                  </button>
                  <Link href={`/character/${heroId}`} style={styles.linkButton}>
                    자세한 키 관리
                  </Link>
                </div>
              </div>
            ) : null}

            {saveStatus ? <div style={styles.footerStatus}>{saveStatus}</div> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, element }) {
  return (
    <label style={styles.fieldBlock}>
      <span style={styles.fieldLabel}>{label}</span>
      {element}
    </label>
  );
}

const styles = {
  page: {
    display: 'grid',
    gap: 16,
    paddingBottom: 176,
  },
  chatCard: {
    position: 'relative',
    width: '100%',
    minHeight: 620,
    borderRadius: 32,
    overflow: 'hidden',
    border: '1px solid rgba(96,165,250,0.28)',
    background: 'rgba(15,23,42,0.7)',
    boxShadow: '0 46px 120px -70px rgba(37,99,235,0.55)',
  },
  chatBackdrop: imageUrl => ({
    position: 'absolute',
    inset: 0,
    backgroundImage: imageUrl
      ? `linear-gradient(180deg, rgba(15,23,42,0.12) 0%, rgba(15,23,42,0.42) 34%, rgba(15,23,42,0.88) 100%), url(${imageUrl})`
      : 'linear-gradient(180deg, rgba(15,23,42,0.45) 0%, rgba(15,23,42,0.92) 100%)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }),
  chatInner: {
    position: 'relative',
    zIndex: 1,
    minHeight: 620,
    display: 'grid',
    gridTemplateRows: 'auto 1fr auto',
  },
  chatHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    padding: '18px 18px 12px',
    background: 'linear-gradient(180deg, rgba(15,23,42,0.78) 0%, rgba(15,23,42,0.18) 100%)',
  },
  identityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  avatarShell: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    overflow: 'hidden',
    border: '1px solid rgba(148,163,184,0.3)',
    background: 'rgba(15,23,42,0.78)',
    flex: '0 0 auto',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    color: '#f8fafc',
  },
  identityText: {
    display: 'grid',
    gap: 2,
    minWidth: 0,
  },
  identityName: {
    fontSize: 18,
    color: '#f8fafc',
  },
  identityMeta: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  headerAction: {
    appearance: 'none',
    border: '1px solid rgba(148,163,184,0.3)',
    borderRadius: 999,
    padding: '10px 14px',
    background: 'rgba(2,6,23,0.48)',
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: 800,
    flex: '0 0 auto',
  },
  chatLog: {
    display: 'grid',
    gap: 10,
    alignContent: 'start',
    padding: '10px 16px 18px',
    overflowY: 'auto',
    minHeight: 0,
  },
  messageBubble: isAssistant => ({
    justifySelf: isAssistant ? 'start' : 'end',
    maxWidth: '88%',
    borderRadius: isAssistant ? '18px 18px 18px 8px' : '18px 18px 8px 18px',
    background: isAssistant ? 'rgba(15,23,42,0.92)' : 'rgba(56,189,248,0.18)',
    border: isAssistant
      ? '1px solid rgba(148,163,184,0.18)'
      : '1px solid rgba(125,211,252,0.26)',
    padding: '12px 14px',
    color: '#e2e8f0',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  }),
  loadingBubble: {
    justifySelf: 'start',
    maxWidth: '88%',
    borderRadius: '18px 18px 18px 8px',
    background: 'rgba(15,23,42,0.92)',
    border: '1px solid rgba(148,163,184,0.18)',
    padding: '12px 14px',
    color: '#94a3b8',
    lineHeight: 1.6,
    letterSpacing: '0.2em',
  },
  emptyState: {
    color: '#cbd5e1',
    fontSize: 14,
    textAlign: 'center',
    padding: '46px 12px',
  },
  inputArea: {
    display: 'grid',
    gap: 10,
    padding: 16,
    borderTop: '1px solid rgba(148,163,184,0.16)',
    background: 'rgba(15,23,42,0.76)',
  },
  inputBox: {
    minHeight: 116,
    resize: 'vertical',
    borderRadius: 18,
    border: '1px solid rgba(148,163,184,0.24)',
    background: 'rgba(15,23,42,0.72)',
    color: '#f8fafc',
    padding: '14px 16px',
    fontSize: 14,
    lineHeight: 1.6,
  },
  inputMetaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  metaText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  statusText: {
    color: '#bae6fd',
    fontSize: 12,
  },
  sendButton: disabled => ({
    marginLeft: 'auto',
    appearance: 'none',
    border: '1px solid rgba(125,211,252,0.24)',
    borderRadius: 999,
    padding: '10px 16px',
    background: disabled ? 'rgba(51,65,85,0.64)' : 'rgba(125,211,252,0.92)',
    color: disabled ? '#94a3b8' : '#082f49',
    fontWeight: 900,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
  panelWrap: {
    position: 'sticky',
    bottom: 72,
    zIndex: 8,
    display: 'grid',
    gap: 8,
  },
  panelToggleRow: {
    display: 'flex',
    justifyContent: 'center',
  },
  panelToggle: {
    appearance: 'none',
    border: '1px solid rgba(148,163,184,0.3)',
    borderRadius: 999,
    padding: '10px 16px',
    background: 'rgba(2,6,23,0.72)',
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: 800,
    backdropFilter: 'blur(12px)',
  },
  panelBody: {
    borderRadius: 28,
    padding: 16,
    background: 'rgba(15,23,42,0.9)',
    border: '1px solid rgba(96,165,250,0.24)',
    boxShadow: '0 32px 90px -58px rgba(15,23,42,0.92)',
    display: 'grid',
    gap: 14,
  },
  sectionTabs: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    paddingBottom: 2,
  },
  sectionTab: active => ({
    appearance: 'none',
    border: active ? '1px solid rgba(125,211,252,0.4)' : '1px solid rgba(148,163,184,0.24)',
    borderRadius: 999,
    padding: '9px 14px',
    background: active ? 'rgba(56,189,248,0.16)' : 'rgba(2,6,23,0.48)',
    color: active ? '#e0f2fe' : '#cbd5e1',
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  }),
  sectionBlock: {
    display: 'grid',
    gap: 12,
  },
  fieldBlock: {
    display: 'grid',
    gap: 6,
  },
  fieldLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: 700,
  },
  textField: {
    borderRadius: 16,
    border: '1px solid rgba(148,163,184,0.24)',
    background: 'rgba(15,23,42,0.72)',
    color: '#f8fafc',
    padding: '12px 14px',
    fontSize: 13,
  },
  panelTextArea: minHeight => ({
    minHeight,
    resize: 'vertical',
    borderRadius: 16,
    border: '1px solid rgba(148,163,184,0.22)',
    background: 'rgba(15,23,42,0.72)',
    color: '#f8fafc',
    padding: '12px 14px',
    fontSize: 13,
    lineHeight: 1.6,
  }),
  primaryButton: {
    appearance: 'none',
    border: '1px solid rgba(125,211,252,0.24)',
    borderRadius: 999,
    padding: '11px 16px',
    background: 'rgba(125,211,252,0.92)',
    color: '#082f49',
    fontSize: 13,
    fontWeight: 900,
    justifySelf: 'start',
  },
  inlineActions: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  linkButton: {
    textDecoration: 'none',
    padding: '10px 14px',
    borderRadius: 999,
    background: 'rgba(15,23,42,0.72)',
    color: '#e2e8f0',
    border: '1px solid rgba(148,163,184,0.24)',
    fontSize: 12,
    fontWeight: 800,
  },
  summaryLine: {
    color: '#cbd5e1',
    fontSize: 13,
  },
  memoryList: {
    display: 'grid',
    gap: 8,
  },
  memoryCard: {
    borderRadius: 16,
    padding: '12px 14px',
    background: 'rgba(15,23,42,0.72)',
    border: '1px solid rgba(148,163,184,0.18)',
    display: 'grid',
    gap: 6,
  },
  memoryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 12,
    color: '#94a3b8',
  },
  memoryText: {
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  emptySmall: {
    color: '#94a3b8',
    fontSize: 13,
  },
  archiveList: {
    display: 'grid',
    gap: 8,
  },
  archiveCard: {
    borderRadius: 16,
    padding: '12px 14px',
    background: 'rgba(15,23,42,0.72)',
    border: '1px solid rgba(148,163,184,0.18)',
    display: 'grid',
    gap: 6,
  },
  archiveDate: {
    fontSize: 11,
    color: '#94a3b8',
  },
  archiveText: {
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  },
  apiStatusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'center',
  },
  apiBadge: active => ({
    padding: '4px 10px',
    borderRadius: 999,
    background: active ? 'rgba(34,197,94,0.18)' : 'rgba(248,113,113,0.16)',
    color: active ? '#86efac' : '#fecaca',
    fontSize: 12,
    fontWeight: 800,
  }),
  footerStatus: {
    color: '#bae6fd',
    fontSize: 12,
    lineHeight: 1.5,
  },
};
