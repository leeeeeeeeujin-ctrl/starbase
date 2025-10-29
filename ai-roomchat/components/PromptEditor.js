import { useState, useEffect } from 'react'
import Link from 'next/link'

// Lightweight client-side render used for device-run demo.
function renderClientTemplate(template, input = {}) {
  let out = String(template || '')
  // simple {{key}} replacement and nested path support like {{player.name}}
  out = out.replace(/{{\s*([\w.\-]+)\s*}}/g, (_, path) => {
    const parts = path.split('.')
    let v = input
    for (const p of parts) {
      if (v && Object.prototype.hasOwnProperty.call(v, p)) v = v[p]
      else return ''
    }
    return String(v)
  })
  return out
}

export default function PromptEditor({ promptId = 'local', initialBody = '', onChange }) {
  const [body, setBody] = useState(initialBody)
  const [jsonInput, setJsonInput] = useState('{}')
  const [lastRunPreview, setLastRunPreview] = useState(null)
  const [deviceRunnerUrl, setDeviceRunnerUrl] = useState('')
  const [deviceRunnerSecret, setDeviceRunnerSecret] = useState('')

  useEffect(() => {
    // If parent changes initialBody (e.g. AI Assist applied), sync it into the editor
    setBody(initialBody)
  }, [initialBody])

  // load persisted device runner settings from localStorage once
  useEffect(() => {
    try {
      const savedUrl = localStorage.getItem('prompt-editor:deviceRunnerUrl')
      const savedSecret = localStorage.getItem('prompt-editor:deviceRunnerSecret')
      if (savedUrl) setDeviceRunnerUrl(savedUrl)
      if (savedSecret) setDeviceRunnerSecret(savedSecret)
    } catch (e) {
      // ignore
    }
  }, [])

  // Notify parent when body changes
  useEffect(() => {
    if (typeof onChange === 'function') onChange(body)
  }, [body, onChange])

  function handleRunOnDevice() {
    let parsed = {}
    try {
      parsed = jsonInput ? JSON.parse(jsonInput) : {}
    } catch (err) {
      alert('Input JSON parse error: ' + String(err))
      return
    }

    const rendered = renderClientTemplate(body, parsed)
    const providerResponse = {
      text: rendered,
      rendered_prompt: rendered,
      meta: { runAt: new Date().toISOString(), mode: 'device-mock' },
    }

    try {
      const key = `ai-assist-result:${promptId}`
      localStorage.setItem(key, JSON.stringify(providerResponse))
      setLastRunPreview(providerResponse)
      alert('Run saved to localStorage and ready to apply via editor page.')
    } catch (err) {
      alert('Failed to save run to localStorage: ' + String(err))
    }
  }

  async function handleRunOnDeviceRunner() {
    if (!deviceRunnerUrl) return alert('Device runner URL not set')

    let parsed = {}
    try {
      parsed = jsonInput ? JSON.parse(jsonInput) : {}
    } catch (err) {
      alert('Input JSON parse error: ' + String(err))
      return
    }

    const rendered = renderClientTemplate(body, parsed)

    try {
      const res = await fetch(deviceRunnerUrl.replace(/\/$/, '') + '/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(deviceRunnerSecret ? { 'x-runner-secret': deviceRunnerSecret } : {}),
        },
        body: JSON.stringify({ prompt: rendered }),
      })

      if (!res.ok) {
        const txt = await res.text()
        throw new Error('device runner error: ' + res.status + ' ' + txt)
      }

      const json = await res.json()
      const providerResponse = { text: String(json.text || json.out || ''), raw: json, rendered_prompt: rendered, meta: { runAt: new Date().toISOString(), runner: 'device' } }
      setLastRunPreview(providerResponse)
      try { localStorage.setItem(`ai-assist-result:${promptId}`, JSON.stringify(providerResponse)) } catch (e) {}
      // persist runner settings
      try {
        localStorage.setItem('prompt-editor:deviceRunnerUrl', deviceRunnerUrl)
        if (deviceRunnerSecret) localStorage.setItem('prompt-editor:deviceRunnerSecret', deviceRunnerSecret)
      } catch (e) {}
      alert('Device runner completed, preview saved.')
    } catch (err) {
      alert('Device runner failed: ' + String(err))
    }
  }

  async function submitLastRunToServer() {
    if (!lastRunPreview) return alert('No last run preview to submit')
    try {
      const parsed = jsonInput ? JSON.parse(jsonInput) : {}
      const res = await fetch(`/api/prompts/${encodeURIComponent(promptId)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'client', input: parsed, provider_response: lastRunPreview, source: 'client' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'server failed')
      alert('Submitted device run to server. RunId: ' + String(json.runId) + ' verified=' + String(json.verified))
    } catch (err) {
      alert('Submit failed: ' + String(err))
    }
  }

  async function handleSubmitToServer() {
    let parsed = {}
    try {
      parsed = jsonInput ? JSON.parse(jsonInput) : {}
    } catch (err) {
      alert('Input JSON parse error: ' + String(err))
      return
    }

    const rendered = renderClientTemplate(body, parsed)
    const providerResponse = { text: rendered, rendered_prompt: rendered, meta: { runAt: new Date().toISOString(), mode: 'device-mock' } }

    try {
      const res = await fetch(`/api/prompts/${encodeURIComponent(promptId)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'client', input: parsed, provider_response: providerResponse, source: 'client' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'server failed')
      alert('Submitted to server. RunId: ' + String(json.runId) + ' verified=' + String(json.verified))
    } catch (err) {
      alert('Submit failed: ' + String(err))
    }
  }

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <div style={{ flex: 1 }}>
        <h3>Prompt Editor</h3>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ width: '100%', height: 320, fontFamily: 'monospace', fontSize: 13 }}
        />

        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', marginBottom: 6 }}>Sample input (JSON)</label>
          <textarea value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} style={{ width: '100%', height: 80, fontFamily: 'monospace', fontSize: 12 }} />
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={{ display: 'block', marginBottom: 6 }}>Device runner URL (optional, e.g. http://192.168.0.5:3001)</label>
          <input value={deviceRunnerUrl} onChange={(e) => setDeviceRunnerUrl(e.target.value)} style={{ width: '100%' }} placeholder="http://<device-ip>:3001" />
          <label style={{ display: 'block', marginTop: 6 }}>Device runner secret (optional)</label>
          <input value={deviceRunnerSecret} onChange={(e) => setDeviceRunnerSecret(e.target.value)} style={{ width: '100%' }} placeholder="shared secret header" />
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
            <Link href="#"><a>Insert variable</a></Link>
          </li>
          <li>
            <Link href="#"><a>Format</a></Link>
          </li>
        </ul>
        <div style={{ marginTop: 16 }}>
          <button onClick={handleRunOnDevice} style={{ display: 'inline-block', padding: '8px 12px', background: '#0b5fff', color: 'white', borderRadius: 6, border: 'none' }}>Run on device (mock)</button>
          <button onClick={handleRunOnDeviceRunner} style={{ display: 'inline-block', padding: '8px 12px', marginLeft: 8 }}>Run on device (runner)</button>
          <div style={{ marginTop: 8 }}>
            <button onClick={submitLastRunToServer} style={{ display: 'inline-block', padding: '8px 10px', marginRight: 8 }}>Submit last device run to server</button>
            <button onClick={handleSubmitToServer} style={{ display: 'inline-block', padding: '8px 10px' }}>Render+Submit (client)</button>
          </div>
          <div style={{ marginTop: 12 }}>
            <Link href="#ai-assist">
              <a data-test-id="ai-assist-button" style={{ display: 'inline-block', padding: '8px 12px', background: '#0b5fff', color: 'white', borderRadius: 6, marginTop: 8 }}>AI Assist (code)</a>
            </Link>
            <p style={{ fontSize: 12, marginTop: 8 }}>클릭하면 추가 AI 보조 UI로 이동합니다.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
