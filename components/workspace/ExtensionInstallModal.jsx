import React, { useEffect, useState } from 'react';

export default function ExtensionInstallModal({ open, onClose }) {
  const [ghToken, setGhToken] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!open) return;
    try {
      const t = localStorage.getItem('gh.token') || '';
      setGhToken(t);
      const link = JSON.parse(localStorage.getItem('gh.repo') || 'null');
      if (link) {
        setOwner(link.owner || '');
        setRepo(link.repo || '');
        setBranch(link.branch || 'main');
      }
    } catch {}
  }, [open]);

  function saveToken() {
    try {
      localStorage.setItem('gh.token', ghToken.trim());
      alert('GitHub 토큰이 로컬에 저장되었습니다.');
    } catch {}
  }

  function saveRepo() {
    try {
      localStorage.setItem('gh.repo', JSON.stringify({ owner: owner.trim(), repo: repo.trim(), branch: branch.trim() }));
      alert('레포 연결 정보가 로컬에 저장되었습니다.');
    } catch {}
  }

  function installSampleExtension() {
    const id = `sample-gh-sync`;
    const ext = {
      id,
      name: 'GitHub Sync (샘플)',
      kind: 'github',
      config: { owner, repo, branch },
      enabled: true,
      installedAt: Date.now(),
    };
    try {
      const list = JSON.parse(localStorage.getItem('extensions') || '[]');
      const next = [ext, ...list.filter((e) => e.id !== id)];
      localStorage.setItem('extensions', JSON.stringify(next));
      alert('샘플 확장 프로그램 설치 완료(로컬).');
    } catch {}
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

  if (!open) return null;
  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={{ fontWeight: 700 }}>확장 프로그램 설치</div>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>1) GitHub 로그인(로컬 저장)</div>
          <input
            type="password"
            placeholder="Personal Access Token (repo 권한)"
            value={ghToken}
            onChange={(e) => setGhToken(e.target.value)}
            style={styles.input}
          />
          <button style={styles.btn} onClick={saveToken}>토큰 저장</button>
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
          <button style={styles.primaryBtn} onClick={installSampleExtension}>GitHub Sync (샘플) 설치</button>
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
  primaryBtn: { background: '#1d4ed8', color: '#fff', border: '1px solid #1d4ed8', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' },
  row: { display: 'flex', gap: 8 },
  events: { border: '1px solid #334155', borderRadius: 8, padding: 8, maxHeight: 240, overflow: 'auto' },
  eventItem: { borderBottom: '1px solid rgba(51,65,85,0.5)', padding: '6px 0' },
  pre: { whiteSpace: 'pre-wrap', margin: 0, fontSize: 12 }
};

