import React, { useState, useEffect } from 'react';

// Minimal Monaco-like editor placeholder. We avoid adding heavy Monaco dependency
// in this PoC and provide a simple textarea that behaves as an editor.

export default function EditorMonaco({ initial = '', storageKey = 'editor:template' }) {
  const [code, setCode] = useState(initial);
  const [tokenState, setTokenState] = useState({ token: null, secret: null, exp: 0 });

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) setCode(saved);
  }, [storageKey]);

  function save() {
    (async () => {
      try {
        const name = window.prompt('Template name (short):', 'my-template');
        if (!name) return;
        const resp = await fetch('/editor/templates', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, code }),
        });
        if (!resp.ok) throw new Error('save failed: ' + resp.status);
        const j = await resp.json();
        localStorage.setItem(storageKey, code);
        alert('Saved to server as ' + (j.template && j.template.id));
      } catch (e) {
        // fallback to localStorage
        localStorage.setItem(storageKey, code);
        alert('Saved locally (server save failed): ' + e.message);
      }
    })();
  }

  function load() {
    (async () => {
      try {
        const resp = await fetch('/editor/templates');
        if (!resp.ok) throw new Error('list failed: ' + resp.status);
        const j = await resp.json();
        const list = (j.templates || []).map(t => `${t.id}: ${t.name}`);
        if (list.length === 0) {
          const saved = localStorage.getItem(storageKey) || '';
          setCode(saved);
          alert('No server templates found; loaded local copy');
          return;
        }
        const pick = window.prompt('Select template by index:\n' + list.map((l, i) => `${i}) ${l}`).join('\n'));
        const idx = parseInt(pick, 10);
        if (Number.isNaN(idx) || idx < 0 || idx >= (j.templates || []).length) { alert('invalid selection'); return; }
        const id = j.templates[idx].id;
        const got = await fetch('/editor/templates/' + id);
        if (!got.ok) throw new Error('fetch template failed');
        const tj = await got.json();
        setCode(tj.template.code || '');
        alert('Loaded template ' + (tj.template && tj.template.name));
      } catch (e) {
        const saved = localStorage.getItem(storageKey) || '';
        setCode(saved);
        alert('Load failed; loaded local copy. ' + e.message);
      }
    })();
  }

  async function run() {
    // PoC: request a short-lived token and secret, sign request client-side using Web Crypto
    try {
      // request token if missing or expired (5s safety margin)
      const now = Date.now();
      const needNew = !tokenState.token || (tokenState.exp && now > tokenState.exp - 5000);
      let tk = null;
      if (needNew) {
        const tokenRes = await fetch('/token', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ clientId: 'editor' }),
        });
        if (tokenRes.status !== 200) throw new Error('token endpoint failed: ' + tokenRes.status);
        tk = await tokenRes.json();
        const exp = (tk.ttl ? Date.now() + tk.ttl * 1000 : Date.now() + 5 * 60 * 1000);
        setTokenState({ token: tk.token, secret: tk.secret, exp });
      } else {
        tk = { token: tokenState.token, secret: tokenState.secret, ttl: Math.floor((tokenState.exp - Date.now())/1000) };
      }
      const bodyObj = { prompt: code };
      const body = JSON.stringify(bodyObj);
      const ts = Math.floor(Date.now() / 1000).toString();
      const nonce = `web-${Date.now()}`;

      // helper: hex -> Uint8Array
      function hexToBytes(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return bytes;
      }

      async function hmacHex(keyHex, msg) {
        const keyBytes = hexToBytes(keyHex);
        const cryptoKey = await window.crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await window.crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg));
        const arr = Array.from(new Uint8Array(sig));
        return arr.map(b => b.toString(16).padStart(2, '0')).join('');
      }

  const keyForSig = tk.secret; // server returns per-token secret (PoC)
      let signature = null;
      if (keyForSig) {
        signature = await hmacHex(keyForSig, `editor:${ts}:${nonce}:${body}`);
      }

      const headers = { 'content-type': 'application/json' };
      if (tk.token) headers['Authorization'] = `Bearer ${tk.token}`;
      if (signature) {
        headers['x-signature'] = signature;
        headers['x-nonce'] = nonce;
        headers['x-timestamp'] = ts;
      }

      const resp = await fetch('/v1/gemini', {
        method: 'POST',
        headers,
        body,
      });
      const j = await resp.json();
      alert('Run result: ' + JSON.stringify(j).slice(0, 200));
    } catch (e) {
      alert('Run failed (PoC): ' + e.message + '\nIf you want full integration, check console for details.');
      console.error(e);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        style={{ width: '100%', height: 240, fontFamily: 'monospace', fontSize: 13 }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save}>Save</button>
        <button onClick={load}>Load</button>
        <button onClick={run}>Run (PoC)</button>
      </div>
    </div>
  );
}
