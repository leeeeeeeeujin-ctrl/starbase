// mobile-runner-mock.js
// Simple mock runner that accepts a prompt and returns a mocked provider response.
const express = require('express')
const bodyParser = require('body-parser')

const PORT = Number(process.env.RUNNER_PORT || 3001)
const SHARED_SECRET = process.env.RUNNER_SECRET || 'dev-secret'

const app = express()
app.use(bodyParser.json())

app.use((req, res, next) => {
  const s = req.header('x-runner-secret')
  if (!s || s !== SHARED_SECRET) return res.status(401).json({ error: 'unauthorized' })
  next()
})

app.post('/run', (req, res) => {
  const { prompt } = req.body || {}
  if (!prompt) return res.status(400).json({ error: 'missing prompt' })
  // Mock behaviour: echo prompt with a prefix
  const out = `MOCK-GEMINI-RESP: ${String(prompt).trim()}`
  res.json({ text: out, raw: out })
})

app.listen(PORT, () => console.log('mobile-runner-mock listening on', PORT))
