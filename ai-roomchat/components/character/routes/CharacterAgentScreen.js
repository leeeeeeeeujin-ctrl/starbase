'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import {
  appendRecentChat,
  applyMemoryAction,
  readHeroAgentProfile,
  sanitizeHeroAgentProfile,
  writeHeroAgentProfile,
} from '@/lib/characters/agentProfileStorage';
import {
  HERO_CHAT_INPUT_MAX_LENGTH,
  HERO_MEMORY_ENTRY_MAX_LENGTH,
  HERO_MEMORY_SLOT_MAX,
  HERO_RECENT_CHAT_MAX,
} from '@/lib/characters/profileRules';

const INITIAL_PROFILE = {
  systemPrompt: '',
  memories: [],
  recentChats: [],
};

export default function CharacterAgentScreen({ hero }) {
  const heroImage = hero?.image_url || hero?.background_url || '';
  const heroId = hero?.id ? String(hero.id) : '';
  const [profile, setProfile] = useState(INITIAL_PROFILE);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!heroId) return;
    const stored = readHeroAgentProfile(heroId);
    setProfile(stored || INITIAL_PROFILE);
    setInput('');
    setStatus('');
  }, [heroId]);

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
      name: hero?.name || '이름 없는 캐릭터',
      description: hero?.description || '',
      abilities: [hero?.ability1, hero?.ability2, hero?.ability3, hero?.ability4].filter(Boolean),
    }),
    [hero?.ability1, hero?.ability2, hero?.ability3, hero?.ability4, hero?.description, hero?.name]
  );

  const buildPrompt = useCallback(
    userInput => {
      const recentChats = profile.recentChats
        .slice(-HERO_RECENT_CHAT_MAX)
        .map(entry => `${entry.role === 'assistant' ? 'AI' : 'USER'}: ${entry.text}`)
        .join('\n');
      const memories = profile.memories
        .map((entry, index) => `${index}. ${entry.text}`)
        .join('\n');

      return [
        '너는 유저가 육성하는 캐릭터 AI다.',
        '캐릭터의 기본 정보는 이미 사실로 알고 있으며, 그 성격과 말투를 대화로 함께 다듬는다.',
        `이름: ${profileSummary.name}`,
        `설명: ${profileSummary.description || '없음'}`,
        `능력: ${profileSummary.abilities.length ? profileSummary.abilities.join(' / ') : '없음'}`,
        `메모리 슬롯 제한: ${HERO_MEMORY_SLOT_MAX}개`,
        `메모리 한 칸 길이 제한: ${HERO_MEMORY_ENTRY_MAX_LENGTH}자`,
        '중요한 사실은 메모리로 추가/수정/삭제할 수 있다.',
        '불필요하거나 오래된 메모리는 스스로 정리해도 된다.',
        '응답은 반드시 JSON 하나만 반환한다.',
        '형식:',
        '{"reply":"유저에게 보일 답변","memoryAction":{"type":"none|add|update|delete","index":0,"text":"메모리 내용"}}',
        `현재 메모리:\n${memories || '없음'}`,
        `최근 대화:\n${recentChats || '없음'}`,
        `유저 입력:\n${userInput}`,
      ].join('\n\n');
    },
    [profile.memories, profile.recentChats, profileSummary]
  );

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !heroId) return;

    setLoading(true);
    setStatus('');

    const userMessage = {
      id: `chat-${Date.now()}-user`,
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
        id: `chat-${Date.now()}-assistant`,
        role: 'assistant',
        text: String(parsed?.reply || data?.text || '').slice(0, HERO_CHAT_INPUT_MAX_LENGTH),
        createdAt: new Date().toISOString(),
      };

      let updatedProfile = appendRecentChat(nextProfile, assistantMessage);
      updatedProfile = applyMemoryAction(updatedProfile, parsed?.memoryAction);
      persistProfile(updatedProfile);

      if (parsed?.memoryAction?.type && parsed.memoryAction.type !== 'none') {
        setStatus('메모리가 갱신되었습니다.');
      }
    } catch (error) {
      console.error('[CharacterAgent] chat failed', error);
      setStatus(error.message || '대화를 처리하지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [buildPrompt, heroId, input, loading, persistProfile, profile]);

  return (
    <>
      <section
        style={{
          position: 'relative',
          minHeight: 300,
          padding: 18,
          borderRadius: 28,
          overflow: 'hidden',
          background: 'rgba(2, 6, 23, 0.78)',
          border: '1px solid rgba(148, 163, 184, 0.22)',
          display: 'grid',
          alignContent: 'space-between',
          gap: 18,
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: heroImage
              ? `linear-gradient(180deg, rgba(2,6,23,0.18) 0%, rgba(2,6,23,0.58) 40%, rgba(2,6,23,0.92) 100%), url(${heroImage})`
              : 'linear-gradient(180deg, rgba(2,6,23,0.48) 0%, rgba(2,6,23,0.92) 100%)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, display: 'grid', gap: 10, justifyItems: 'start' }}>
          <Link
            href={`/chat?heroId=${hero?.id || ''}`}
            style={{
              textDecoration: 'none',
              padding: '10px 16px',
              borderRadius: 999,
              background: 'rgba(2, 6, 23, 0.62)',
              color: '#e2e8f0',
              fontSize: 13,
              fontWeight: 900,
              border: '1px solid rgba(148, 163, 184, 0.26)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 18px 44px -28px rgba(15,23,42,0.72)',
            }}
          >
            전체 채팅으로
          </Link>
          <strong style={{ fontSize: 24 }}>캐릭터 AI</strong>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: '#dbeafe', maxWidth: 360 }}>
            이 공간에선 {profileSummary.name}의 성격, 말투, 행동 원칙을 대화로 다듬습니다. 중요한 내용은
            AI가 메모리 슬롯에 직접 올리거나 수정할 수 있습니다.
          </p>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gap: 14,
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 0.9fr)',
        }}
      >
        <div
          style={{
            borderRadius: 28,
            background: 'rgba(2, 6, 23, 0.82)',
            border: '1px solid rgba(148, 163, 184, 0.22)',
            display: 'grid',
            gridTemplateRows: 'auto 1fr auto',
            minHeight: 560,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(148,163,184,0.16)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 16 }}>캐릭터 대화</strong>
            <span style={{ color: '#94a3b8', fontSize: 12 }}>{`최근 대화 ${profile.recentChats.length}/${HERO_RECENT_CHAT_MAX}`}</span>
          </div>

          <div style={{ padding: 16, display: 'grid', gap: 10, alignContent: 'start', overflowY: 'auto' }}>
            {profile.recentChats.length ? (
              profile.recentChats.map(entry => (
                <div
                  key={entry.id}
                  style={{
                    justifySelf: entry.role === 'assistant' ? 'start' : 'end',
                    maxWidth: '88%',
                    borderRadius: entry.role === 'assistant' ? '18px 18px 18px 8px' : '18px 18px 8px 18px',
                    background: entry.role === 'assistant' ? 'rgba(15,23,42,0.92)' : 'rgba(56,189,248,0.18)',
                    border: entry.role === 'assistant'
                      ? '1px solid rgba(148,163,184,0.18)'
                      : '1px solid rgba(125,211,252,0.26)',
                    padding: '12px 14px',
                    color: '#e2e8f0',
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {entry.text}
                </div>
              ))
            ) : (
              <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '36px 12px' }}>
                아직 대화가 없습니다.
              </div>
            )}
          </div>

          <div style={{ padding: 16, borderTop: '1px solid rgba(148,163,184,0.16)', display: 'grid', gap: 10 }}>
            <textarea
              value={input}
              maxLength={HERO_CHAT_INPUT_MAX_LENGTH}
              onChange={event => setInput(event.target.value)}
              placeholder="캐릭터 AI와 대화하면서 성격과 행동 원칙을 조율합니다."
              style={{
                minHeight: 120,
                resize: 'vertical',
                borderRadius: 18,
                border: '1px solid rgba(148,163,184,0.24)',
                background: 'rgba(15,23,42,0.72)',
                color: '#f8fafc',
                padding: '14px 16px',
                fontSize: 14,
                lineHeight: 1.6,
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>{`${input.length}/${HERO_CHAT_INPUT_MAX_LENGTH}`}</span>
              {status ? <span style={{ color: '#bae6fd', fontSize: 12 }}>{status}</span> : null}
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || !input.trim()}
                style={{
                  marginLeft: 'auto',
                  appearance: 'none',
                  border: '1px solid rgba(125,211,252,0.24)',
                  borderRadius: 999,
                  padding: '10px 16px',
                  background: loading || !input.trim() ? 'rgba(51,65,85,0.64)' : 'rgba(125,211,252,0.92)',
                  color: loading || !input.trim() ? '#94a3b8' : '#082f49',
                  fontWeight: 900,
                  cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? '응답 중…' : '보내기'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <section
            style={{
              padding: 16,
              borderRadius: 24,
              background: 'rgba(2, 6, 23, 0.78)',
              border: '1px solid rgba(148, 163, 184, 0.22)',
              display: 'grid',
              gap: 10,
            }}
          >
            <strong style={{ fontSize: 15 }}>기본 규칙</strong>
            <div style={{ color: '#cbd5e1', fontSize: 13, lineHeight: 1.7, display: 'grid', gap: 6 }}>
              <div>{`메모리 슬롯 ${HERO_MEMORY_SLOT_MAX}개`}</div>
              <div>{`메모리 1칸 ${HERO_MEMORY_ENTRY_MAX_LENGTH}자`}</div>
              <div>{`최근 대화 ${HERO_RECENT_CHAT_MAX}개 유지`}</div>
              <div>{`입력 최대 ${HERO_CHAT_INPUT_MAX_LENGTH}자`}</div>
            </div>
          </section>

          <section
            style={{
              padding: 16,
              borderRadius: 24,
              background: 'rgba(2, 6, 23, 0.78)',
              border: '1px solid rgba(148, 163, 184, 0.22)',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <strong style={{ fontSize: 15 }}>메모리 슬롯</strong>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>{`${profile.memories.length}/${HERO_MEMORY_SLOT_MAX}`}</span>
            </div>
            {profile.memories.length ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {profile.memories.map((entry, index) => (
                  <div
                    key={entry.id}
                    style={{
                      borderRadius: 16,
                      padding: '12px 14px',
                      background: 'rgba(15,23,42,0.72)',
                      border: '1px solid rgba(148,163,184,0.18)',
                      display: 'grid',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong style={{ fontSize: 12, color: '#bae6fd' }}>{`메모리 ${index + 1}`}</strong>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{`${entry.text.length}/${HERO_MEMORY_ENTRY_MAX_LENGTH}`}</span>
                    </div>
                    <div style={{ color: '#e2e8f0', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{entry.text}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#94a3b8', fontSize: 13 }}>아직 저장된 메모리가 없습니다.</div>
            )}
          </section>
        </div>
      </section>
    </>
  );
}
