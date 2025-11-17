import React, { useEffect, useMemo, useState } from 'react';
import { validateCapabilities } from '../../lib/workspace/validateCapabilities.js';
import { loadCapabilitiesMeta, saveCapabilitiesMeta } from '../../lib/workspace/capabilitiesMeta.js';

const BUILTIN_EXTENSIONS = [
  {
    id: 'codex-web',
    name: 'OpenAI Codex Web',
    kind: 'codex',
    description:
      '브라우저에서 OpenAI Codex 웹 IDE를 열고, 워크스페이스와 연계할 준비를 합니다. (현재는 단순 실행용 자리표시자입니다.)',
  },
  {
    id: 'github-sync',
    name: 'GitHub Sync (샘플)',
    kind: 'github',
    description:
      '현재 세트를 GitHub 레포와 동기화하는 샘플 확장입니다. (토큰/레포 정보는 브라우저 로컬에만 저장됩니다.)',
  },
];

export default function ExtensionInstallModal({
  open,
  onClose,
  workspaceId,
  extensions = [],
  loading = false,
  saving = false,
  error = null,
  onChangeExtensions,
}) {
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
   const [githubUser, setGithubUser] = useState(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);
  const [capabilities, setCapabilities] = useState([]);
  const [selectedCaps, setSelectedCaps] = useState([]);
  const [capIssues, setCapIssues] = useState(null);

  // Load capabilities contracts (static) once per modal lifetime
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/runtime/capability-contracts');
        if (!alive) return;
        if (!r.ok) return;
        const j = await r.json().catch(() => ({}));
        const list = Array.isArray(j?.capabilities) ? j.capabilities : (Array.isArray(j?.contracts) ? j.contracts : []);
        setCapabilities(list);
      } catch {
        // ignore capability load errors for now
      }
    })();
    return () => { alive = false; };
  }, []);

  // Load per-set capability selection when modal opens
  useEffect(() => {
    if (!open || !workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const out = await loadCapabilitiesMeta(workspaceId);
        if (cancelled) return;
        const list = Array.isArray(out?.capabilities) ? out.capabilities : [];
        // Normalize to simple id array for now
        const ids = list.map((c) => (typeof c === 'string' ? c : c?.id)).filter(Boolean);
        setSelectedCaps(ids);
        setCapIssues(null);
      } catch {
        // ignore load errors
      }
    })();
    return () => { cancelled = true; };
  }, [open, workspaceId]);

  // Auto-validate capabilities whenever selection changes while modal is open
  useEffect(() => {
    if (!open || !workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        setCapIssues(null);
        const [setRes, capRes] = await Promise.all([
          fetch(`/api/workspace/sets/${encodeURIComponent(workspaceId)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch('/api/runtime/capability-contracts').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (cancelled) return;
        if (!setRes || !capRes) {
          setCapIssues([]);
          return;
        }
        const contracts = Array.isArray(capRes.capabilities)
          ? capRes.capabilities
          : (Array.isArray(capRes.contracts) ? capRes.contracts : []);
        const issues = validateCapabilities({
          files: setRes.files || [],
          contracts,
          selectedIds: selectedCaps,
        });
        setCapIssues(issues || []);
      } catch {
        if (!cancelled) setCapIssues([]);
      }
    })();
    return () => { cancelled = true; };
  }, [open, workspaceId, selectedCaps]);

  useEffect(() => {
    if (!open) return;
    try {
      const link = JSON.parse(localStorage.getItem('gh.repo') || 'null');
      if (link) {
        setOwner(link.owner || '');
        setRepo(link.repo || '');
        setBranch(link.branch || 'main');
      }
    } catch {
      // ignore localStorage errors
    }
  }, [open]);

  // GitHub OAuth: load current user when modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/github/me');
        if (!res.ok) {
          if (!cancelled) setGithubUser(null);
          return;
        }
        const data = await res.json().catch(() => null);
        if (!cancelled) {
          setGithubUser(data?.user || null);
        }
      } catch {
        if (!cancelled) setGithubUser(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Listen for OAuth completion messages from popup window
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handler = (event) => {
      const msg = event?.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type !== 'github-connected') return;
      // Refresh GitHub user info after OAuth completes
      (async () => {
        try {
          const res = await fetch('/api/github/me');
          if (!res.ok) {
            setGithubUser(null);
            return;
          }
          const data = await res.json().catch(() => null);
          setGithubUser(data?.user || null);
        } catch {
          setGithubUser(null);
        }
      })();
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
    };
  }, []);

  // When GitHub is connected and the modal is open, try to auto-load
  // repositories once. If an owner/repo is already set (from localStorage),
  // this effect does not override it.
  useEffect(() => {
    if (!open) return;
    if (!githubUser) return;
    if (owner || repo) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/github/list-repos');
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data?.ok || !Array.isArray(data.repos) || !data.repos.length) {
          return;
        }
        const first = data.repos[0];
        setOwner(first.owner || '');
        setRepo(first.repo || '');
        setBranch(first.branch || 'main');
      } catch {
        // ignore auto-load errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, githubUser, owner, repo]);

  function saveRepo() {
    try {
      localStorage.setItem('gh.repo', JSON.stringify({ owner: owner.trim(), repo: repo.trim(), branch: branch.trim() }));
      alert('레포 연결 정보가 로컬에 저장되었습니다.');
    } catch {}
  }

  const [query, setQuery] = useState('');

  const filteredExtensions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BUILTIN_EXTENSIONS;
    return BUILTIN_EXTENSIONS.filter((ext) => {
      const haystack = `${ext.name} ${ext.id} ${ext.description || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  async function toggleCapability(id) {
    if (!workspaceId || !id) return;
    setSelectedCaps((prev) => {
      const has = prev.includes(id);
      const next = has ? prev.filter((x) => x !== id) : [...prev, id];
      // Fire-and-forget save; errors are swallowed for now
      (async () => {
        try {
          await saveCapabilitiesMeta(workspaceId, next);
        } catch {
          // TODO: surface toast/error if needed
        }
      })();
      return next;
    });
  }

  async function toggleExtension(ext, installed) {
    if (typeof onChangeExtensions !== 'function') return;
    const prev = Array.isArray(extensions) ? extensions : [];
    let next;
    if (installed) {
      next = prev.filter((e) => e.id !== ext.id);
    } else {
      const base = {
        id: ext.id,
        name: ext.name,
        kind: ext.kind,
        config: { owner: owner.trim(), repo: repo.trim(), branch: branch.trim() },
        enabled: true,
        installedAt: Date.now(),
      };
      next = [base, ...prev.filter((e) => e.id !== ext.id)];
    }
    try {
      await onChangeExtensions(next);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[extensions] failed to update config', err);
    }
  }

  function connectEvents() {
    if (!owner || !repo) return;
    try {
      const es = new EventSource(`/api/github/events?repo=${encodeURIComponent(`${owner}/${repo}`)}`);
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          setEvents((prev) => [data, ...prev].slice(0, 50));
        } catch {}
      };
      es.onerror = () => {
        es.close();
        setConnected(false);
      };
      setConnected(true);
      return () => es.close();
    } catch {
      setConnected(false);
    }
  }

  function openGithubConnectWindow() {
    try {
      if (typeof window !== 'undefined') {
        window.open('/api/github/oauth/start', 'github-oauth', 'width=600,height=700,noopener,noreferrer');
      }
    } catch {
      // ignore open errors
    }
  }

  async function logoutGithub() {
    try {
      await fetch('/api/github/logout', { method: 'POST' });
    } catch {
      // ignore logout errors
    }
    setGithubUser(null);
  }

  async function handleCreateAndLinkRepo() {
    if (!githubUser) {
      // eslint-disable-next-line no-alert
      alert('먼저 GitHub 계정을 연결해주세요.');
      return;
    }
    // eslint-disable-next-line no-alert
    const name = window.prompt('생성할 GitHub 레포 이름을 입력하세요.');
    if (!name || !name.trim()) return;
    try {
      const res = await fetch('/api/github/create-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        // eslint-disable-next-line no-alert
        alert(`레포 생성에 실패했습니다: ${data?.error || res.status}`);
        return;
      }
      setOwner(data.owner || '');
      setRepo(data.repo || '');
      setBranch(data.branch || 'main');
      try {
        localStorage.setItem(
          'gh.repo',
          JSON.stringify({
            owner: data.owner || '',
            repo: data.repo || '',
            branch: data.branch || 'main',
          }),
        );
      } catch {
        // ignore localStorage errors
      }
      if (data.htmlUrl) {
        // eslint-disable-next-line no-alert
        if (window.confirm('레포가 생성되었습니다. GitHub에서 열어볼까요?')) {
          try {
            window.open(data.htmlUrl, '_blank', 'noopener,noreferrer');
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // eslint-disable-next-line no-alert
      alert('레포 생성에 실패했습니다.');
    }
  }

  async function handlePickExistingRepo() {
    if (!githubUser) {
      // eslint-disable-next-line no-alert
      alert('먼저 GitHub 계정을 연결해주세요.');
      return;
    }
    try {
      const res = await fetch('/api/github/list-repos');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok || !Array.isArray(data.repos)) {
        // eslint-disable-next-line no-alert
        alert('레포 목록을 가져오지 못했습니다.');
        return;
      }
      if (!data.repos.length) {
        // eslint-disable-next-line no-alert
        alert('연동 가능한 레포가 없습니다. 먼저 GitHub에서 레포를 하나 만들어주세요.');
        return;
      }
      const listText = data.repos
        .map((r, idx) => `${idx + 1}) ${r.fullName} (${r.branch})`)
        .join('\n');
      // eslint-disable-next-line no-alert
      const input = window.prompt(
        `연동할 레포 번호를 입력하세요:\n${listText}`,
      );
      if (!input) return;
      const index = Number(input) - 1;
      if (Number.isNaN(index) || index < 0 || index >= data.repos.length) {
        // eslint-disable-next-line no-alert
        alert('잘못된 번호입니다.');
        return;
      }
      const chosen = data.repos[index];
      setOwner(chosen.owner || '');
      setRepo(chosen.repo || '');
      setBranch(chosen.branch || 'main');
      try {
        localStorage.setItem(
          'gh.repo',
          JSON.stringify({
            owner: chosen.owner || '',
            repo: chosen.repo || '',
            branch: chosen.branch || 'main',
          }),
        );
      } catch {
        // ignore
      }
    } catch {
      // eslint-disable-next-line no-alert
      alert('레포 목록을 가져오지 못했습니다.');
    }
  }

  if (!open) return null;
  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={{ fontWeight: 700 }}>확장 프로그램 설치</div>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>1) GitHub 연결 (웹 로그인 권장)</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>
            일반적으로는 아래 확장 설치만 사용해도 됩니다. 필요하다면 GitHub 웹에서 먼저 로그인한 뒤,
            이 워크스페이스에서 사용할 레포(owner/repo/branch)만 지정해 주세요.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <button
              style={styles.btn}
              type="button"
              onClick={openGithubConnectWindow}
            >
              GitHub 웹 열기
            </button>
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>2) 레포 연결</div>
          <div style={styles.row}>
            <input placeholder="owner" value={owner} onChange={(e) => setOwner(e.target.value)} style={styles.input} />
            <input placeholder="repo" value={repo} onChange={(e) => setRepo(e.target.value)} style={styles.input} />
            <input placeholder="branch" value={branch} onChange={(e) => setBranch(e.target.value)} style={styles.input} />
          </div>
          <button style={styles.btn} onClick={saveRepo}>연결 정보 저장</button>
          <button style={styles.btn} onClick={connectEvents} disabled={connected}>SSE 연결(웹훅 수신)</button>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>3) 확장 설치</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>
            세트별로 사용할 확장 프로그램을 선택합니다. (현재 워크스페이스:
            {' '}
            <span style={{ fontFamily: 'monospace' }}>{workspaceId || '알 수 없음'}</span>
            )
          </div>
          <input
            type="text"
            placeholder="확장 프로그램 검색…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ ...styles.input, width: '100%', marginRight: 0, marginBottom: 8 }}
          />
          {loading ? (
            <div style={{ fontSize: 13, color: '#9ca3af' }}>확장 설정을 불러오는 중…</div>
          ) : (
            <div>
              {filteredExtensions.map((ext) => {
                const installed = Array.isArray(extensions)
                  ? extensions.some((e) => e.id === ext.id && e.enabled !== false)
                  : false;
                return (
                  <div
                    key={ext.id}
                    style={{
                      borderRadius: 8,
                      border: '1px solid #1f2937',
                      padding: 8,
                      marginBottom: 8,
                      background: '#020617',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{ext.name}</div>
                      <button
                        type="button"
                        style={installed ? styles.secondaryBtn : styles.primaryBtn}
                        disabled={saving}
                        onClick={() => toggleExtension(ext, installed)}
                      >
                        {installed ? '언인스톨' : '인스톨'}
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{ext.description}</div>
                  </div>
                );
              })}
              {filteredExtensions.length === 0 && (
                <div style={{ fontSize: 13, color: '#9ca3af' }}>일치하는 확장 프로그램이 없습니다.</div>
              )}
            </div>
          )}
          {error ? (
            <div style={{ marginTop: 6, fontSize: 12, color: '#f97316' }}>{error}</div>
          ) : null}
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>4) 게임 Capabilities</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>
            이 세트가 런타임에서 사용할 기능들을 선택합니다. (core / ui / world / network 등)
          </div>
          {capabilities.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9ca3af' }}>capability 계약 정보를 불러오는 중이거나, 정의된 capability가 없습니다.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
              {capabilities.map((cap) => {
                const id = cap.id;
                const checked = selectedCaps.includes(id);
                return (
                  <label
                    key={id}
                    style={{
                      borderRadius: 8,
                      border: checked ? '1px solid #2563eb' : '1px solid #1f2937',
                      padding: 8,
                      background: checked ? 'rgba(37,99,235,0.12)' : '#020617',
                      cursor: 'pointer',
                      display: 'block',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCapability(id)}
                        style={{ margin: 0 }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{cap.label || cap.id}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{cap.category}</div>
                      </div>
                    </div>
                    {cap.purpose ? (
                      <div style={{ fontSize: 12, color: '#9ca3af' }}>{cap.purpose}</div>
                    ) : null}
                  </label>
                );
              })}
            </div>
          )}
          {Array.isArray(capIssues) && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              {capIssues.length === 0 ? (
                <span style={{ color: '#4ade80' }}>선택된 capabilities에 필요한 파일이 모두 준비되어 있습니다.</span>
              ) : (
                <div style={{ color: '#f97316' }}>
                  <div style={{ marginBottom: 4 }}>검사 결과:</div>
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {capIssues.map((issue, i) => (
                      <li key={i}>
                        {issue.type === 'missing_file'
                          ? `[${issue.capabilityId}] 파일 없음: ${issue.path}`
                          : issue.type === 'unknown_capability'
                            ? `알 수 없는 capability id: ${issue.capabilityId}`
                            : issue.message || `문제가 있습니다: ${issue.capabilityId}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>최근 이벤트</div>
          <div style={styles.events}>
            {events.map((e, i) => (
              <div key={i} style={styles.eventItem}>
                <div style={{ opacity: 0.7, fontSize: 12 }}>{e.type} · {e.repo}</div>
                <pre style={styles.pre}>{JSON.stringify(e.raw?.head_commit || e.raw?.pull_request || e.raw?.issue || e.raw, null, 2)}</pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 3000,
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  modal: {
    width: 720, maxWidth: '90vw', maxHeight: '85vh', overflow: 'auto',
    background: '#0b1220', border: '1px solid rgba(19,28,47,0.5)', borderRadius: 16,
    boxShadow: '0 24px 60px rgba(0,0,0,0.45)', padding: 16
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  closeBtn: { background: 'transparent', color: '#ddd', border: 'none', fontSize: 24, cursor: 'pointer' },
  section: { marginTop: 12 },
  sectionTitle: { fontWeight: 600, marginBottom: 6 },
  input: { background: '#0b1220', color: '#ddd', border: '1px solid #334155', borderRadius: 8, padding: '8px 10px', marginRight: 8 },
  btn: { background: '#111827', color: '#ddd', border: '1px solid #334155', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', marginRight: 8 },
  primaryBtn: { background: '#1d4ed8', color: '#fff', border: '1px solid #1d4ed8', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12 },
  secondaryBtn: { background: '#111827', color: '#e5e7eb', border: '1px solid #4b5563', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12 },
  row: { display: 'flex', gap: 8 },
  events: { border: '1px solid #334155', borderRadius: 8, padding: 8, maxHeight: 240, overflow: 'auto' },
  eventItem: { borderBottom: '1px solid rgba(51,65,85,0.5)', padding: '6px 0' },
  pre: { whiteSpace: 'pre-wrap', margin: 0, fontSize: 12 }
};
