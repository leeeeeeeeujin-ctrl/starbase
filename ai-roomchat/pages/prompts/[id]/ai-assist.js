import { useRouter } from 'next/router'
import { useState } from 'react'
import Link from 'next/link'

function AIAssistPanel({ promptId }) {
  const [instruction, setInstruction] = useState('Refactor to be more concise')
  const [response, setResponse] = useState(null)
  const [loading, setLoading] = useState(false)
  const [sampleInput, setSampleInput] = useState('{ "player": { "name": "Alex" } }')

  async function runAssist() {
    setLoading(true)
    setResponse(null)
    try {
      let inputObj = {}
      try {
        inputObj = JSON.parse(sampleInput)
      } catch (err) {
        // if JSON parse fails, send empty input
        inputObj = {}
      }

      const res = await fetch(`/api/prompts/${encodeURIComponent(promptId)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: inputObj, provider: 'mock' }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'run failed')

      const prov = json.providerResponse || json
      const text = prov && prov.text ? prov.text : JSON.stringify(prov)
      setResponse({ text, raw: prov })

      try {
        localStorage.setItem(`ai-assist-result:${promptId}`, JSON.stringify({ text, raw: prov }))
      } catch (err) {
        // ignore storage errors
      }
    } catch (err) {
      setResponse({ text: `Error: ${String(err)}` })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h2>AI Assist — {promptId}</h2>
      <p>Enter instruction for the AI to act as a coding assistant for this prompt.</p>
      <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} style={{ width: '100%', height: 80 }} />
      <div style={{ marginTop: 8 }}>
        <label style={{ fontSize: 12 }}>Sample input (JSON):</label>
        <textarea value={sampleInput} onChange={(e) => setSampleInput(e.target.value)} style={{ width: '100%', height: 80, marginTop: 4 }} />
      </div>
      <div style={{ marginTop: 8 }}>
        <button onClick={runAssist} disabled={loading}>{loading ? 'Running…' : 'Run AI Assist'}</button>
        <Link href={`/prompts/${encodeURIComponent(promptId)}/edit`}><a style={{ marginLeft: 12 }}>Back to editor</a></Link>
      </div>
      <div style={{ marginTop: 16 }}>
        <h4>AI Response</h4>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{response ? response.text : <em>No response yet</em>}</pre>
      </div>
    </div>
  )
}

export default function AIAssistPage() {
  const router = useRouter()
  const { id } = router.query

  return (
    <div style={{ padding: 20 }}>
      <h1>AI Assist</h1>
      {id ? <AIAssistPanel promptId={id} /> : <p>Loading...</p>}
    </div>
  )
}
