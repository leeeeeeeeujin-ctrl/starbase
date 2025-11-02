'use client';

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Core editors (lazy where heavy)
import MakerEditor from '../../../components/maker/editor/MakerEditor';
const MultiLanguageCodeEditor = dynamic(
  () => import('../../../components/maker/editor/MultiLanguageCodeEditor'),
  { ssr: false }
);
const GameSimulator = dynamic(
  () => import('../../../components/maker/editor/GameSimulator'),
  { ssr: false }
);
const VisualNodeEditor = dynamic(
  () => import('../../../components/maker/visual/VisualNodeEditor'),
  { ssr: false }
);

// Optional AI manager (for configuring API keys)
const AIApiManager = dynamic(
  () => import('../../../components/maker/settings/AIApiManager'),
  { ssr: false }
);

// AI calling helper
import { makeCallModel } from '../../../lib/modelClient';
import { apiManager } from '../../../lib/encryption';

const MODES = ['prompt', 'blocks', 'code', 'test'];

function ModeSwitcher({ mode, onChange }) {
  const startX = useRef(0);
  const deltaX = useRef(0);
  const dragging = useRef(false);

  const index = useMemo(() => MODES.indexOf(mode), [mode]);

  const onPointerDown = e => {
    dragging.current = true;
    startX.current = e.clientX ?? (e.touches ? e.touches[0].clientX : 0);
    deltaX.current = 0;
  };
  const onPointerMove = e => {
    if (!dragging.current) return;
    const x = e.clientX ?? (e.touches ? e.touches[0].clientX : 0);
    deltaX.current = x - startX.current;
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const threshold = 40; // px to switch mode
    if (deltaX.current > threshold && index > 0) onChange(MODES[index - 1]);
    else if (deltaX.current < -threshold && index < MODES.length - 1) onChange(MODES[index + 1]);
    deltaX.current = 0;
  };

  const btn = (id, label, i) => (
    <button
      key={id}
      onClick={() => onChange(id)}
      className={`px-3 py-1 rounded-full text-sm font-semibold transition-colors duration-150 ${
        id === mode
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {label}
    </button>
  );

  return (
    <div
      onMouseDown={onPointerDown}
      onMouseMove={onPointerMove}
      onMouseUp={onPointerUp}
      onTouchStart={onPointerDown}
      onTouchMove={onPointerMove}
      onTouchEnd={onPointerUp}
      className="sticky top-0 z-20 w-full backdrop-blur bg-white/70 border-b border-gray-200"
      style={{ userSelect: 'none' }}
    >
      <div className="max-w-screen-xl mx-auto px-3">
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-6">
            <span className="text-xs font-bold tracking-wide text-gray-500">MODE</span>
            <div className="flex items-center gap-6 overflow-x-auto no-scrollbar py-1">
              {btn('prompt', '프롬프트·노드', 0)}
              {btn('blocks', '블록코딩', 1)}
              {btn('code', '코드 에디터', 2)}
              {btn('test', '테스트', 3)}
            </div>
          </div>
          <span className="text-xs text-gray-400">드래그로 전환</span>
        </div>
      </div>
    </div>
  );
}

function AISidebar({ open, onClose }) {
  const [chat, setChat] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const [showApi, setShowApi] = useState(false);

  const activeApis = useMemo(() => apiManager.getActiveApis?.() || [], []);
  const first = activeApis[0] || null;

  const callModel = useMemo(() => {
    if (!first) return null;
    return makeCallModel({
      getKey: () => apiManager.getActiveApiKey(first.provider, first.model) || '',
      getApiVersion: () => (first.provider === 'google' ? 'gemini' : 'responses'),
      getGeminiMode: () => 'v1beta',
      getGeminiModel: () => first.model,
    });
  }, [first]);

  const send = useCallback(async () => {
    const text = (chat || '').trim();
    if (!text) return;
    setChat('');
    setHistory(h => [...h, { type: 'user', message: text, ts: Date.now() }]);
    if (!callModel) {
      setHistory(h => [
        ...h,
        { type: 'error', message: 'AI 키가 설정되지 않았습니다. 우측 상단 설정을 열어 키를 추가해주세요.', ts: Date.now() },
      ]);
      return;
    }
    setBusy(true);
    const res = await callModel({ system: 'You are a helpful coding assistant.', userText: text });
    setBusy(false);
    if (res?.ok) setHistory(h => [...h, { type: 'ai', message: res.text || '', ts: Date.now() }]);
    else setHistory(h => [...h, { type: 'error', message: res?.error || '요청 실패', ts: Date.now() }]);
  }, [chat, callModel]);

  return (
    <div
      className="fixed top-0 right-0 h-screen transition-transform duration-200 ease-out"
      style={{ width: 360, transform: open ? 'translateX(0)' : 'translateX(330px)', zIndex: 60 }}
      aria-hidden={!open}
    >
      <div className="absolute -left-8 top-24">
        <button
          onClick={open ? onClose : undefined}
          className="w-8 h-16 rounded-l-lg bg-blue-600 text-white shadow hover:bg-blue-700"
          title={open ? '닫기' : ''}
        >
          ▶
        </button>
      </div>

      <div className="h-full border-l border-gray-200 bg-white flex flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <div>
            <div className="font-semibold">AI 자연어 코딩</div>
            <div className="text-xs text-gray-500">키 설정 후 바로 대화/생성 가능</div>
          </div>
          <button
            onClick={() => setShowApi(true)}
            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
          >설정</button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 text-sm">
          {history.map((m, i) => (
            <div key={i} className={m.type === 'user' ? 'text-right' : 'text-left'}>
              <div className={`inline-block max-w-[80%] px-3 py-2 rounded ${
                m.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : m.type === 'error'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-900'
              }`}>
                <div className="whitespace-pre-wrap">{m.message}</div>
              </div>
            </div>
          ))}
          {busy && <div className="text-xs text-gray-500">AI가 생각 중…</div>}
        </div>

        <div className="p-3 border-t space-y-2">
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="설명이나 요청을 입력하세요…"
              value={chat}
              onChange={e => setChat(e.target.value)}
              onKeyDown={e => (e.key === 'Enter' ? send() : null)}
              disabled={busy}
            />
            <button
              onClick={send}
              disabled={busy || !chat.trim()}
              className={`px-3 py-2 rounded text-sm font-medium ${
                busy || !chat.trim() ? 'bg-gray-300 text-gray-600' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >보내기</button>
          </div>
          <div className="text-[11px] text-gray-500">Tip: "이 프롬프트를 개선해줘", "코드 템플릿 생성"</div>
        </div>

        {showApi && (
          <div className="fixed inset-0 bg-black/50" style={{ zIndex: 70 }} onClick={() => setShowApi(false)}>
            <div className="absolute inset-y-6 right-6 w-[min(640px,calc(100%-48px))] bg-white rounded-xl overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
              <AIApiManager visible={true} onClose={() => setShowApi(false)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function MakerWorkbenchPage() {
  const [mode, setMode] = useState('prompt');
  const [aiOpen, setAiOpen] = useState(false);

  // Right-edge small arrow to open
  useEffect(() => {
    // optional: close AI panel on route change etc.
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <ModeSwitcher mode={mode} onChange={setMode} />

      <div className="max-w-screen-xl mx-auto px-3 py-4">
        {/* Main area switches by mode */}
        {mode === 'prompt' && (
          <div className="relative">
            <MakerEditor />
          </div>
        )}
        {mode === 'blocks' && (
          <div className="relative rounded-xl border border-gray-200 bg-white overflow-hidden">
            <VisualNodeEditor isMobile={false} deviceTier="desktop" />
          </div>
        )}
        {mode === 'code' && (
          <div className="relative rounded-xl border border-gray-200 bg-white overflow-hidden">
            <MultiLanguageCodeEditor />
          </div>
        )}
        {mode === 'test' && (
          <div className="relative rounded-xl border border-gray-200 bg-white overflow-hidden">
            <GameSimulator />
          </div>
        )}
      </div>

      {/* Right mini arrow button to toggle AI */}
      <button
        onClick={() => setAiOpen(v => !v)}
        className="fixed right-0 top-24 z-50 w-6 h-12 rounded-l bg-blue-600 text-white shadow hover:bg-blue-700"
        title="AI 패널 열기"
      >
        {aiOpen ? '▶' : '◀'}
      </button>

      <AISidebar open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  );
}
