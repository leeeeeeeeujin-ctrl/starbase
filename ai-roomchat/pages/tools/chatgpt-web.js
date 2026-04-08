'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

const pageStyle = {
  minHeight: '100vh',
  background: '#020617',
  color: '#e2e8f0',
  padding: '32px 20px 80px',
};

const shellStyle = {
  width: '100%',
  maxWidth: 1080,
  margin: '0 auto',
  display: 'grid',
  gap: 20,
};

const cardStyle = {
  padding: 20,
  borderRadius: 24,
  border: '1px solid rgba(148,163,184,0.2)',
  background: 'rgba(15,23,42,0.78)',
};

const textAreaStyle = {
  width: '100%',
  minHeight: 240,
  borderRadius: 18,
  border: '1px solid rgba(51,65,85,0.9)',
  background: 'rgba(2,6,23,0.82)',
  color: '#e2e8f0',
  padding: 16,
  fontSize: 13,
  lineHeight: 1.6,
  resize: 'vertical',
  boxSizing: 'border-box',
};

const fieldStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid rgba(51,65,85,0.9)',
  background: 'rgba(2,6,23,0.82)',
  color: '#e2e8f0',
  fontSize: 13,
  boxSizing: 'border-box',
};

function JsonPane({ value }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 16,
        borderRadius: 18,
        background: 'rgba(2,6,23,0.82)',
        border: '1px solid rgba(51,65,85,0.8)',
        fontSize: 12,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowX: 'auto',
      }}
    >
      {value}
    </pre>
  );
}

const DEFAULT_PROMPT = `Return exactly one fenced code block with JSON only.

Schema:
{
  "ok": true,
  "summary": "short string"
}`;

export default function ChatgptWebToolsPage() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [expectType, setExpectType] = useState('json');
  const [cleanupMode, setCleanupMode] = useState('delete');
  const [timeoutMs, setTimeoutMs] = useState(240000);
  const [headless, setHeadless] = useState(false);
  const [runMode, setRunMode] = useState('local-helper');
  const [helperUrl, setHelperUrl] = useState('http://127.0.0.1:4319');
  const [browserChannel, setBrowserChannel] = useState('chrome');
  const [userDataDir, setUserDataDir] = useState('');
  const [profileName, setProfileName] = useState('Default');
  const [executablePath, setExecutablePath] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const parsedPreview = useMemo(() => {
    if (!result?.payload) return '';
    return JSON.stringify(result.payload, null, 2);
  }, [result]);

  async function handleRun() {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      const endpoint =
        runMode === 'local-helper'
          ? `${helperUrl.replace(/\/$/, '')}/run`
          : '/api/tools/chatgpt-web/run';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt,
          expect: expectType,
          cleanup: cleanupMode,
          timeoutMs,
          headless,
          browserChannel,
          userDataDir,
          profileName,
          executablePath,
        }),
      });
      const payload = await response.json().catch(() => null);
      setResult(payload);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.payload?.error || payload?.error || 'chatgpt_web_run_failed');
      }
    } catch (runError) {
      setError(runError?.message || '실행에 실패했다.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <h1 style={{ margin: 0, fontSize: 28 }}>ChatGPT 웹 보조 실행기</h1>
              <p style={{ margin: 0, color: '#94a3b8', lineHeight: 1.7 }}>
                로그인된 브라우저 세션에서 ChatGPT 웹을 열고, 새 채팅에 프롬프트를 넣어 코드블록
                응답을 회수하는 개발용 도구다. 인간 확인이나 로그인 화면이 뜨면 열린 브라우저에서
                직접 처리하면 된다.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link
                href="/pokerogue"
                style={{
                  padding: '10px 16px',
                  borderRadius: 999,
                  border: '1px solid rgba(148,163,184,0.28)',
                  color: '#e2e8f0',
                  textDecoration: 'none',
                }}
              >
                포켓로그 화면
              </Link>
            </div>
          </div>
        </section>

        <section style={{ ...cardStyle, display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ fontWeight: 700 }}>프롬프트</label>
            <textarea value={prompt} onChange={event => setPrompt(event.target.value)} style={textAreaStyle} />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontWeight: 700 }}>실행 경로</label>
              <select value={runMode} onChange={event => setRunMode(event.target.value)} style={fieldStyle}>
                <option value="local-helper">로컬 헬퍼 프로그램</option>
                <option value="server-api">개발 서버 API</option>
              </select>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontWeight: 700 }}>브라우저 채널</label>
              <select value={browserChannel} onChange={event => setBrowserChannel(event.target.value)} style={fieldStyle}>
                <option value="chrome">설치된 Chrome</option>
                <option value="chromium">Playwright Chromium</option>
              </select>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontWeight: 700 }}>기대 응답 형식</label>
              <select value={expectType} onChange={event => setExpectType(event.target.value)} style={fieldStyle}>
                <option value="json">JSON 코드블록</option>
                <option value="text">텍스트</option>
              </select>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontWeight: 700 }}>실행 후 채팅 정리</label>
              <select value={cleanupMode} onChange={event => setCleanupMode(event.target.value)} style={fieldStyle}>
                <option value="delete">삭제 시도</option>
                <option value="none">그대로 두기</option>
              </select>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontWeight: 700 }}>타임아웃(ms)</label>
              <input
                type="number"
                value={timeoutMs}
                onChange={event => setTimeoutMs(Number(event.target.value) || 240000)}
                style={fieldStyle}
              />
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 700,
                alignSelf: 'end',
              }}
            >
              <input type="checkbox" checked={headless} onChange={event => setHeadless(event.target.checked)} />
              Headless 실행
            </label>
          </div>

          {runMode === 'local-helper' ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontWeight: 700 }}>로컬 헬퍼 주소</label>
              <input
                type="text"
                value={helperUrl}
                onChange={event => setHelperUrl(event.target.value)}
                style={fieldStyle}
                placeholder="http://127.0.0.1:4319"
              />
            </div>
          ) : null}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontWeight: 700 }}>사용자 데이터 폴더</label>
              <input
                type="text"
                value={userDataDir}
                onChange={event => setUserDataDir(event.target.value)}
                style={fieldStyle}
                placeholder="예: C:\\Users\\...\\AppData\\Local\\Google\\Chrome\\User Data"
              />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontWeight: 700 }}>프로필 이름</label>
              <input
                type="text"
                value={profileName}
                onChange={event => setProfileName(event.target.value)}
                style={fieldStyle}
                placeholder="Default / Profile 1"
              />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontWeight: 700 }}>브라우저 실행 파일 경로</label>
              <input
                type="text"
                value={executablePath}
                onChange={event => setExecutablePath(event.target.value)}
                style={fieldStyle}
                placeholder="비워두면 channel 사용"
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleRun}
              disabled={running || !prompt.trim()}
              style={{
                padding: '12px 18px',
                borderRadius: 999,
                border: 'none',
                background: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 100%)',
                color: '#0f172a',
                fontWeight: 800,
                cursor: running ? 'wait' : 'pointer',
              }}
            >
              {running ? '실행 중… 브라우저를 확인해' : '브라우저 열고 실행'}
            </button>
          </div>

          <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.7 }}>
            권장 흐름:
            <br />
            1. 로컬 헬퍼를 쓸 땐 <code>npm run chatgpt:web:bridge</code>로 먼저 브리지를 띄운다.
            <br />
            2. Chrome 기존 프로필을 쓰려면 사용자 데이터 폴더와 프로필 이름을 넣고, 가능하면 기존 Chrome 창은 먼저 닫는다.
            <br />
            3. 버튼을 누른 뒤 열린 브라우저 창을 본다.
            <br />
            4. Cloudflare 인간 확인이나 로그인 화면이 뜨면 직접 통과한다.
            <br />
            5. 그러면 스크립트가 새 채팅에 프롬프트를 넣고 응답을 기다린다.
          </div>
        </section>

        {error ? (
          <section style={{ ...cardStyle, borderColor: 'rgba(248,113,113,0.35)' }}>
            <p style={{ margin: 0, color: '#fca5a5' }}>{error}</p>
          </section>
        ) : null}

        {result ? (
          <section style={{ ...cardStyle, display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>실행 결과</h2>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>
                성공 여부: {String(Boolean(result?.ok))}
              </p>
            </div>
            <JsonPane value={parsedPreview || JSON.stringify(result, null, 2)} />
          </section>
        ) : null}
      </div>
    </main>
  );
}
