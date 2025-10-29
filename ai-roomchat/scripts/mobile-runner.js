// Simple mobile runner for devices that can run Node (Termux/Android).
// Usage: set GEMINI_CLI_PATH and optional RUNNER_PORT/RUNNER_SECRET, then `node mobile-runner.js`.
const express = require('express')
const { spawn } = require('child_process')
const bodyParser = require('body-parser')

const GEMINI_PATH = process.env.GEMINI_CLI_PATH || process.env.GEMINI_PATH || '/usr/bin/gemini'
const PORT = Number(process.env.RUNNER_PORT || 3001)
const SHARED_SECRET = process.env.RUNNER_SECRET || 'dev-secret'

const app = express()
app.use(bodyParser.json())

// Simple secret header auth
app.use((req, res, next) => {
  const s = req.header('x-runner-secret')
  if (!s || s !== SHARED_SECRET) return res.status(401).json({ error: 'unauthorized' })
  next()
})

app.post('/run', (req, res) => {
  const { prompt, args } = req.body || {}
  if (!prompt) return res.status(400).json({ error: 'missing prompt' })

  const runArgs = Array.isArray(args) && args.length ? args : ['--stdin']
  const child = spawn(GEMINI_PATH, runArgs, { stdio: ['pipe', 'pipe', 'pipe'] })

  let out = ''
  let err = ''
  child.stdout.on('data', (b) => { out += String(b) })
  child.stderr.on('data', (b) => { err += String(b) })

  child.on('close', (code) => {
    if (code !== 0) return res.status(500).json({ error: 'cli_error', code, stderr: err })
    return res.json({ text: out.trim(), raw: out, meta: { runner: 'mobile', code } })
  })

  // write prompt to stdin
  child.stdin.write(String(prompt))
  child.stdin.end()
})

app.listen(PORT, () => {
  console.log('mobile-runner listening on port', PORT)
  console.log('GEMINI_PATH=', GEMINI_PATH)
})
