import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useGameIntegration } from './GameIntegrationContext';
import GameRuntime from './game/GameRuntime';
import ConsentModal from './ConsentModal';

// Lightweight client-side render used for device-run demo.
function renderClientTemplate(template, input = {}) {
  let out = String(template || '');
  // simple {{key}} replacement and nested path support like {{player.name}}
  out = out.replace(/{{\s*([\w.\-]+)\s*}}/g, (_, path) => {
    const parts = path.split('.');
    let v = input;
    for (const p of parts) {
      if (v && Object.prototype.hasOwnProperty.call(v, p)) v = v[p];
      else return '';
    }
    return String(v);
  });
  return out;
}

export default function PromptEditor({ promptId = 'local', initialBody = '', onChange }) {
  const [body, setBody] = useState(initialBody);
  const [jsonInput, setJsonInput] = useState('{}');
  const [lastRunPreview, setLastRunPreview] = useState(null);
  const [lastRunnerError, setLastRunnerError] = useState(null);
  const [deviceRunnerUrl, setDeviceRunnerUrl] = useState('');
  const [deviceRunnerSecret, setDeviceRunnerSecret] = useState('');
  const [deviceToken, setDeviceToken] = useState('');
  const gameIntegration = useGameIntegration?.();
  const [targetNodeId, setTargetNodeId] = useState('');
  const [variablesMap, setVariablesMap] = useState({});
  const [varKey, setVarKey] = useState('');
  const [varValue, setVarValue] = useState('');
  const runtimeRef = useRef(null);
  const [signingSecret, setSigningSecret] = useState('');
  const [consentModalOpen, setConsentModalOpen] = useState(false);

  useEffect(() => {
    // If parent changes initialBody (e.g. AI Assist applied), sync it into the editor
    setBody(initialBody);
  }, [initialBody]);

  // load persisted device runner settings from localStorage once
  useEffect(() => {
    try {
      const savedUrl = localStorage.getItem('prompt-editor:deviceRunnerUrl');
      const savedSecret = localStorage.getItem('prompt-editor:deviceRunnerSecret');
      const savedSigning = localStorage.getItem('prompt-editor:signingSecret');
      const savedDeviceToken = localStorage.getItem('prompt-editor:deviceToken');
      if (savedUrl) setDeviceRunnerUrl(savedUrl);
      if (savedSecret) setDeviceRunnerSecret(savedSecret);
      if (savedSigning) setSigningSecret(savedSigning);
      if (savedDeviceToken) setDeviceToken(savedDeviceToken);
    } catch (e) {
      // ignore
    }
  }, []);

  // browser HMAC helper using SubtleCrypto
  async function signPayloadBrowser(obj, secret) {
    if (!secret) return null;
    // stable stringify (same as server)
    function stableStringifyLocal(o) {
      if (o === null || typeof o !== 'object') return JSON.stringify(o);
      if (Array.isArray(o)) return '[' + o.map(stableStringifyLocal).join(',') + ']';
      const ks = Object.keys(o).sort();
      return '{' + ks.map(k => JSON.stringify(k) + ':' + stableStringifyLocal(o[k])).join(',') + '}';
    }
    try {
      const enc = new TextEncoder();
      const keyData = enc.encode(String(secret));
      const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const data = enc.encode(stableStringifyLocal(obj || {}));
      const sig = await crypto.subtle.sign('HMAC', key, data);
      // convert to hex
      const b = new Uint8Array(sig);
      return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      return null;
    }
  }

  // Notify parent when body changes
  useEffect(() => {
    if (typeof onChange === 'function') onChange(body);
  }, [body, onChange]);

  function handleRunOnDevice() {
    let parsed = {};
    try {
      parsed = jsonInput ? JSON.parse(jsonInput) : {};
    } catch (err) {
      alert('Input JSON parse error: ' + String(err));
      return;
    }

    const rendered = renderClientTemplate(body, parsed);
    const providerResponse = {
      text: rendered,
      rendered_prompt: rendered,
      meta: { runAt: new Date().toISOString(), mode: 'device-mock' },
    };

    try {
      const key = `ai-assist-result:${promptId}`;
      localStorage.setItem(key, JSON.stringify(providerResponse));
      setLastRunPreview(providerResponse);
      alert('Run saved to localStorage and ready to apply via editor page.');
    } catch (err) {
      alert('Failed to save run to localStorage: ' + String(err));
    }
  }

  async function handleRunOnDeviceRunner() {
    if (!deviceRunnerUrl) return alert('Device runner URL not set');

    // require explicit consent before calling an external/local runner
    // check persisted consent for this prompt
    try {
      const stored = localStorage.getItem(`prompt-editor:consent:${promptId}`);
      if (!stored) {
        setConsentModalOpen(true);
        return;
      }
    } catch (e) {}

    let parsed = {};
    try {
      parsed = jsonInput ? JSON.parse(jsonInput) : {};
    } catch (err) {
      alert('Input JSON parse error: ' + String(err));
      return;
    }

    const rendered = renderClientTemplate(body, parsed);

    try {
      // Build headers and optionally sign request using signingSecret/deviceToken
      const headers = { 'Content-Type': 'application/json' };
      if (deviceRunnerSecret) headers['x-runner-secret'] = deviceRunnerSecret;
      // attach HMAC-style headers when signingSecret and deviceToken are present
      let ts, nonce, sig;
      if (signingSecret && deviceToken) {
        try {
          ({ ts, nonce, sig } = await signRequestForRunner('POST', '/run', { prompt: rendered }, signingSecret));
          headers['X-Device-Id'] = deviceToken;
          headers['X-Request-Timestamp'] = String(ts);
          headers['X-Request-Nonce'] = nonce;
          headers['X-Client-Signature'] = sig;
        } catch (e) {
          // ignore signing failures and proceed with basic headers
        }
      }

      const res = await fetch(deviceRunnerUrl.replace(/\/$/, '') + '/run', {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt: rendered }),
      });

      if (!res.ok) {
        const txt = await res.text();
        let parsed = null;
        try {
          parsed = JSON.parse(txt);
        } catch (e) {}
        // capture debug info (timestamp/nonce/signature) if present
        setLastRunnerError({ status: res.status, detail: parsed || txt, headers: { 'X-Device-Id': deviceToken, 'X-Request-Timestamp': String(ts), 'X-Request-Nonce': nonce, 'X-Client-Signature': sig } });
        throw new Error('device runner error: ' + res.status + ' ' + (parsed && parsed.error ? parsed.error : txt));
      }

      const json = await res.json();
      const providerResponse = {
        text: String(json.text || json.out || ''),
        raw: json,
        rendered_prompt: rendered,
        meta: { runAt: new Date().toISOString(), runner: 'device' },
      };
      setLastRunPreview(providerResponse);
      try {
        localStorage.setItem(`ai-assist-result:${promptId}`, JSON.stringify(providerResponse));
      } catch (e) {}
      // persist runner settings
      try {
        localStorage.setItem('prompt-editor:deviceRunnerUrl', deviceRunnerUrl);
        if (deviceRunnerSecret)
          localStorage.setItem('prompt-editor:deviceRunnerSecret', deviceRunnerSecret);
      } catch (e) {}
      // fire an audit 'run' event (best-effort) to the server so runs are tracked centrally
      try {
        const actorId = (typeof window !== 'undefined' && window.localStorage && localStorage.getItem('userId')) || null;
        const deviceIdStored = (typeof window !== 'undefined' && window.localStorage && (localStorage.getItem('prompt-editor:deviceToken') || localStorage.getItem('prompt-editor:capabilityToken'))) || deviceToken || null;
        const auditBody = {
          actor_id: actorId,
          device_id: deviceIdStored,
          prompt_id: promptId,
          action: 'run',
          input: parsed || null,
          output: { text: providerResponse.text },
          meta: { run_ts: new Date().toISOString(), runner: 'device' },
        };
        fetch('/api/audit/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auditBody) })
          .then(async r => {
            try {
              if (r.ok) {
                const j = await r.json();
                try {
                  localStorage.setItem(`prompt-editor:run-audit:${promptId}`, j.id);
                } catch (e) {}
              }
            } catch (e) {}
          })
          .catch(() => {});
      } catch (e) {}
      alert('Device runner completed, preview saved.');
    } catch (err) {
      // Show short alert and open debug modal option
      alert('Device runner failed: ' + String(err) + '\n\nOpen Runner Debug panel to inspect headers and server response.');
      // lastRunnerError is already set above when response was non-ok; for network errors, populate minimal info
      if (!lastRunnerError) {
        setLastRunnerError({ status: 'network', detail: String(err), headers: { 'X-Device-Id': deviceToken } });
      }
    }
  }

  // Consent modal handlers
  function handleConfirmConsent() {
    try {
      const record = { ts: Date.now(), promptId };
      localStorage.setItem(`prompt-editor:consent:${promptId}`, JSON.stringify(record));
    } catch (e) {}
    // send an audit record (best-effort) so runs are tracked centrally
    try {
      const actorId = (typeof window !== 'undefined' && window.localStorage && localStorage.getItem('userId')) || null;
      const deviceIdStored = (typeof window !== 'undefined' && window.localStorage && (localStorage.getItem('prompt-editor:deviceToken') || localStorage.getItem('prompt-editor:capabilityToken'))) || deviceToken || null;
      const auditBody = {
        actor_id: actorId,
        device_id: deviceIdStored,
        prompt_id: promptId,
        action: 'consent',
        input: null,
        output: null,
        meta: { consent_ts: new Date().toISOString(), source: 'prompt-editor' },
      };

      // fire-and-forget; don't block the UX
      fetch('/api/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(auditBody),
      })
        .then(async r => {
          try {
            if (r.ok) {
              const j = await r.json();
              try {
                localStorage.setItem(`prompt-editor:consent-audit:${promptId}`, j.id);
              } catch (e) {}
            }
          } catch (e) {}
        })
        .catch(() => {});
    } catch (e) {}

    setConsentModalOpen(false);
    // retry the runner call after consent
    setTimeout(() => handleRunOnDeviceRunner(), 50);
  }

  function handleCancelConsent() {
    setConsentModalOpen(false);
  }

  // Signing helpers for runner (HMAC over method/path/timestamp/nonce/bodyHash)
  async function sha256Hex(text) {
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function signRequestForRunner(method, path, bodyObj, secret) {
    const ts = Math.floor(Date.now() / 1000);
    const nonceBytes = crypto.getRandomValues(new Uint8Array(12));
    const nonce = Array.from(nonceBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
    const bodyHash = await sha256Hex(bodyStr);
    const signingInput = `${method}\n${path}\n${ts}\n${nonce}\n${bodyHash}`;
    // import HMAC key and sign
    const keyData = new TextEncoder().encode(String(secret));
    const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
    const sigHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    return { ts, nonce, sig: sigHex };
  }

  async function submitLastRunToServer() {
    if (!lastRunPreview) return alert('No last run preview to submit');
    try {
      const parsed = jsonInput ? JSON.parse(jsonInput) : {};
      const bodyObj = {
        provider: 'client',
        input: parsed,
        provider_response: lastRunPreview,
        source: 'client',
      };
      const headers = { 'Content-Type': 'application/json' };
      if (signingSecret) {
        try {
          const sig = await signPayloadBrowser(bodyObj, signingSecret);
          if (sig) headers['x-signature'] = sig;
        } catch (e) {}
      }
      // include capability/device token if present (dev convenience)
      try {
        const cap = localStorage.getItem('prompt-editor:capabilityToken');
        const dev = localStorage.getItem('prompt-editor:deviceToken');
        if (cap) headers['x-capability'] = cap;
        if (dev) headers['x-device-token'] = dev;
      } catch (e) {}
      const res = await fetch(`/api/prompts/${encodeURIComponent(promptId)}/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyObj),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'server failed');
      alert(
        'Submitted device run to server. RunId: ' +
          String(json.runId) +
          ' verified=' +
          String(json.verified)
      );
      // Optionally send the run to the currently-mounted game
      try {
        const payloadToSend = lastRunPreview || { ...json, rendered_prompt: json.rendered_prompt };
        gameIntegration?.sendRunToGame && gameIntegration.sendRunToGame(payloadToSend);
      } catch (e) {
        // ignore
      }
    } catch (err) {
      alert('Submit failed: ' + String(err));
    }
  }

  async function handleSubmitToServer() {
    let parsed = {};
    try {
      parsed = jsonInput ? JSON.parse(jsonInput) : {};
    } catch (err) {
      alert('Input JSON parse error: ' + String(err));
      return;
    }

    const rendered = renderClientTemplate(body, parsed);
    const providerResponse = {
      text: rendered,
      rendered_prompt: rendered,
      meta: { runAt: new Date().toISOString(), mode: 'device-mock' },
    };

    try {
      const bodyObj = {
        provider: 'client',
        input: parsed,
        provider_response: providerResponse,
        source: 'client',
      };
      const headers = { 'Content-Type': 'application/json' };
      if (signingSecret) {
        try {
          const sig = await signPayloadBrowser(bodyObj, signingSecret);
          if (sig) headers['x-signature'] = sig;
        } catch (e) {}
      }
      try {
        const cap = localStorage.getItem('prompt-editor:capabilityToken');
        const dev = localStorage.getItem('prompt-editor:deviceToken');
        if (cap) headers['x-capability'] = cap;
        if (dev) headers['x-device-token'] = dev;
      } catch (e) {}
      const res = await fetch(`/api/prompts/${encodeURIComponent(promptId)}/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyObj),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'server failed');
      alert(
        'Submitted to server. RunId: ' + String(json.runId) + ' verified=' + String(json.verified)
      );
      try {
        const payloadToSend = providerResponse || { runId: json.runId, rendered_prompt: rendered };
        gameIntegration?.sendRunToGame && gameIntegration.sendRunToGame(payloadToSend);
      } catch (e) {}
    } catch (err) {
      alert('Submit failed: ' + String(err));
    }
  }

  function handleSendToGame() {
    const payload = lastRunPreview || {
      text: renderClientTemplate(body, jsonInput ? JSON.parse(jsonInput || '{}') : {}),
      rendered_prompt: renderClientTemplate(body, jsonInput ? JSON.parse(jsonInput || '{}') : {}),
      meta: { runAt: new Date().toISOString(), source: 'editor' },
    };
    try {
      gameIntegration?.sendRunToGame && gameIntegration.sendRunToGame(payload);
      alert('Sent run to game (if a game is mounted).');
    } catch (e) {
      alert('Failed to send to game: ' + String(e));
    }
  }

  // Variables panel
  useEffect(() => {
    if (!gameIntegration || !gameIntegration.onVariablesChanged) return;
    const cb = vars => {
      try {
        setVariablesMap(vars || {});
      } catch (e) {}
    };
    gameIntegration.onVariablesChanged(cb);
    // request snapshot once
    try {
      gameIntegration.requestVariables && gameIntegration.requestVariables();
    } catch (e) {}
    return () => {
      try {
        gameIntegration.offVariablesChanged && gameIntegration.offVariablesChanged(cb);
      } catch (e) {}
    };
  }, [gameIntegration]);

  // Local runtime for editor simulation
  useEffect(() => {
    try {
      runtimeRef.current = new GameRuntime({ variables: variablesMap, nodes: [] });
    } catch (e) {
      runtimeRef.current = null;
    }
    return () => {
      runtimeRef.current = null;
    };
  }, []);

  function handleSimulateLocal() {
    try {
      if (!runtimeRef.current) runtimeRef.current = new GameRuntime({ variables: variablesMap });
      const fakeNode = { id: `editor_${Date.now()}`, template: body, type: 'ai' };
      const res = runtimeRef.current.runNode(fakeNode);
      setLastRunPreview({ text: res.response, rendered_prompt: res.response, meta: { simulated: true } });
      alert('로컬 시뮬레이션 완료 (preview에 결과 저장)');
    } catch (e) {
      alert('Local simulation failed: ' + String(e));
    }
  }

  function handleSetVariable() {
    if (!varKey) return alert('Key required');
    try {
      gameIntegration.setVariable && gameIntegration.setVariable(varKey, varValue);
      setVarKey('');
      setVarValue('');
      alert('변수 설정 명령을 보냈습니다');
    } catch (e) {
      alert('Failed to send variable: ' + String(e));
    }
  }

  // Editor -> Game commands
  function handleInsertAsNode() {
    try {
      const node = { type: 'ai', template: body };
      gameIntegration?.sendCommand && gameIntegration.sendCommand('addNode', node);
      alert('Sent addNode command to game.');
    } catch (e) {
      alert('Failed to send addNode: ' + String(e));
    }
  }

  function handleUpdateNode() {
    if (!targetNodeId) return alert('Target nodeId required to update');
    try {
      const updates = { template: body };
      gameIntegration?.sendCommand && gameIntegration.sendCommand('updateNode', { nodeId: targetNodeId, updates });
      alert('Sent updateNode command to game.');
    } catch (e) {
      alert('Failed to send updateNode: ' + String(e));
    }
  }

  function handleExecuteNode() {
    if (!targetNodeId) return alert('Target nodeId required to execute');
    try {
      gameIntegration?.sendCommand && gameIntegration.sendCommand('executeNode', { nodeId: targetNodeId });
      alert('Sent executeNode command to game.');
    } catch (e) {
      alert('Failed to send executeNode: ' + String(e));
    }
  }

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <ConsentModal open={consentModalOpen} onConfirm={handleConfirmConsent} onCancel={handleCancelConsent} />
      {lastRunnerError ? (
        <div
          style={{
            position: 'fixed',
            right: 12,
            bottom: 12,
            width: 360,
            background: 'white',
            border: '1px solid #ddd',
            padding: 12,
            borderRadius: 8,
            zIndex: 9999,
          }}
        >
          <strong>Runner debug</strong>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <div>
              <em>status:</em> {String(lastRunnerError.status)}
            </div>
            <div style={{ marginTop: 8 }}>
              <em>detail:</em>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(lastRunnerError.detail, null, 2)}</pre>
            </div>
            <div style={{ marginTop: 8 }}>
              <em>headers sent:</em>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(lastRunnerError.headers, null, 2)}</pre>
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setLastRunnerError(null)}
                style={{ padding: '6px 10px', background: '#eee', border: 'none' }}
              >
                Close
              </button>
              <button
                onClick={async () => {
                  try {
                    const payload = JSON.stringify(lastRunnerError || {}, null, 2);
                    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                      await navigator.clipboard.writeText(payload);
                      alert('Runner debug copied to clipboard');
                    } else {
                      // fallback
                      const ta = document.createElement('textarea');
                      ta.value = payload;
                      document.body.appendChild(ta);
                      ta.select();
                      document.execCommand('copy');
                      document.body.removeChild(ta);
                      alert('Runner debug copied to clipboard (fallback)');
                    }
                  } catch (e) {
                    alert('Copy failed: ' + String(e));
                  }
                }}
                style={{ padding: '6px 10px', background: '#0b5fff', color: 'white', border: 'none' }}
              >
                Copy details
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div style={{ flex: 1 }}>
        <h3>Prompt Editor</h3>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          style={{ width: '100%', height: 320, fontFamily: 'monospace', fontSize: 13 }}
        />

        <div style={{ marginTop: 12 }}>
          <button
            onClick={async () => {
              try {
                const name = prompt('Template name');
                if (!name) return;
                const res = await fetch('/api/prompt-templates', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name, body }),
                });
                const j = await res.json();
                if (!res.ok) return alert('Save failed: ' + (j.error || res.status));
                alert('Template saved: ' + j.item.id);
              } catch (e) {
                alert('Save error: ' + String(e));
              }
            }}
            style={{ display: 'inline-block', padding: '8px 10px', marginRight: 8 }}
          >
            Save Template
          </button>

          <label style={{ display: 'block', marginBottom: 6 }}>Sample input (JSON)</label>
          <textarea
            value={jsonInput}
            onChange={e => setJsonInput(e.target.value)}
            style={{ width: '100%', height: 80, fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', marginBottom: 6 }}>Target node id (optional for update/execute)</label>
          <input
            value={targetNodeId}
            onChange={e => setTargetNodeId(e.target.value)}
            placeholder="node_..."
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', marginBottom: 6 }}>Signing secret (dev only — used to sign submissions)</label>
          <input
            value={signingSecret}
            onChange={e => {
              setSigningSecret(e.target.value);
              try {
                if (e.target.value) localStorage.setItem('prompt-editor:signingSecret', e.target.value);
                else localStorage.removeItem('prompt-editor:signingSecret');
              } catch (er) {}
            }}
            placeholder="local dev secret"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', marginBottom: 6 }}>Capability token (dev) / Admin password</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={deviceToken || localStorage.getItem('prompt-editor:capabilityToken') || ''}
              readOnly
              style={{ flex: 1 }}
            />
            <button
              onClick={async () => {
                const adminPassword = prompt('Admin password (will be sent to server to request token)');
                if (!adminPassword) return;
                try {
                  const res = await fetch('/api/auth/issue-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: adminPassword }),
                  });
                  const j = await res.json();
                  if (!res.ok) return alert('Token request failed: ' + (j.error || res.status));
                  localStorage.setItem('prompt-editor:capabilityToken', j.token);
                  alert('Capability token saved (expires at ' + new Date(j.exp * 1000).toLocaleString() + ')');
                } catch (e) {
                  alert('Token request error: ' + String(e));
                }
              }}
            >
              Request Token
            </button>
            <button
              onClick={async () => {
                try {
                  const devId = prompt('Device id (optional) - leave blank to auto-generate');
                  const name = prompt('Display name for this device (optional)');
                  const adminPassword = prompt('Admin password (if required by server) - leave blank otherwise');
                  const body = { deviceId: devId || undefined, displayName: name || undefined };
                  if (adminPassword) body.adminPassword = adminPassword;
                  const r = await fetch('/api/devices/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                  });
                  const j = await r.json();
                  if (!r.ok) return alert('Device register failed: ' + (j.error || r.status));
                  localStorage.setItem('prompt-editor:deviceToken', j.token);
                  setDeviceToken(j.token);
                  alert('Device token saved (expires at ' + new Date(j.exp * 1000).toLocaleString() + ')');
                } catch (e) {
                  alert('Device register error: ' + String(e));
                }
              }}
            >
              Register Device
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={{ display: 'block', marginBottom: 6 }}>
            Device runner URL (optional, e.g. http://192.168.0.5:3001)
          </label>
          <input
            value={deviceRunnerUrl}
            onChange={e => setDeviceRunnerUrl(e.target.value)}
            style={{ width: '100%' }}
            placeholder="http://<device-ip>:3001"
          />
          <label style={{ display: 'block', marginTop: 6 }}>Device runner secret (optional)</label>
          <input
            value={deviceRunnerSecret}
            onChange={e => setDeviceRunnerSecret(e.target.value)}
            style={{ width: '100%' }}
            placeholder="shared secret header"
          />
        </div>

        {lastRunPreview ? (
          <div style={{ marginTop: 12, padding: 8, border: '1px dashed #ccc' }}>
            <strong>Last device run preview</strong>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{lastRunPreview.text}</pre>
          </div>
        ) : null}
      </div>

      <div style={{ width: 360 }}>
        <h4>Editor tools</h4>
        <p>Available actions:</p>
        <ul>
          <li>
            <Link href="#">
              <a>Insert variable</a>
            </Link>
          </li>
          <li>
            <Link href="#">
              <a>Format</a>
            </Link>
          </li>
        </ul>
        <div style={{ marginTop: 16 }}>
          <button
            onClick={handleRunOnDevice}
            style={{
              display: 'inline-block',
              padding: '8px 12px',
              background: '#0b5fff',
              color: 'white',
              borderRadius: 6,
              border: 'none',
            }}
          >
            Run on device (mock)
          </button>
          <button
            onClick={handleRunOnDeviceRunner}
            style={{ display: 'inline-block', padding: '8px 12px', marginLeft: 8 }}
          >
            Run on device (runner)
          </button>
          <button
            onClick={handleSimulateLocal}
            style={{ display: 'inline-block', padding: '8px 12px', marginLeft: 8 }}
          >
            Simulate (local runtime)
          </button>
          <div style={{ marginTop: 8 }}>
            <button
              onClick={handleInsertAsNode}
              style={{ display: 'inline-block', padding: '8px 10px', marginRight: 8 }}
            >
              Insert as Node (to game)
            </button>
            <button
              onClick={handleUpdateNode}
              style={{ display: 'inline-block', padding: '8px 10px', marginRight: 8 }}
            >
              Update Node (target id)
            </button>
            <button
              onClick={handleExecuteNode}
              style={{ display: 'inline-block', padding: '8px 10px' }}
            >
              Execute Node (target id)
            </button>
          </div>
            <div style={{ marginTop: 8 }}>
              <button
                onClick={submitLastRunToServer}
                style={{ display: 'inline-block', padding: '8px 10px', marginRight: 8 }}
              >
                Submit last device run to server
              </button>
              <button
                onClick={handleSendToGame}
                style={{ display: 'inline-block', padding: '8px 10px', marginRight: 8 }}
              >
                Send to Game
              </button>
            <button
              onClick={handleSubmitToServer}
              style={{ display: 'inline-block', padding: '8px 10px' }}
            >
              Render+Submit (client)
            </button>
          </div>
          <div style={{ marginTop: 12 }}>
            <Link href="#ai-assist">
              <a
                data-test-id="ai-assist-button"
                style={{
                  display: 'inline-block',
                  padding: '8px 12px',
                  background: '#0b5fff',
                  color: 'white',
                  borderRadius: 6,
                  marginTop: 8,
                }}
              >
                AI Assist (code)
              </a>
            </Link>
            <p style={{ fontSize: 12, marginTop: 8 }}>클릭하면 추가 AI 보조 UI로 이동합니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
