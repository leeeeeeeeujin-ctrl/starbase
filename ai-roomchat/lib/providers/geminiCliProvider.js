const { spawn } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

// Server-side adapter that invokes a local Gemini CLI. Configure via env:
// GEMINI_CLI_PATH - path to the CLI executable (default: 'gemini')
// GEMINI_CLI_ARGS - additional args to pass (space-separated)
// GEMINI_CLI_ACCEPT_STDIN - if '1', write prompt to stdin; otherwise write to temp file and pass path
// GEMINI_CLI_TIMEOUT_MS - numeric timeout in ms (default 30000)

function spawnWithTimeout(cmd, args, opts = {}, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, opts)
    let stdout = ''
    let stderr = ''
    let finished = false

    const kill = () => {
      if (!finished) {
        finished = true
        try {
          child.kill('SIGKILL')
        } catch (e) {}
        reject(new Error('gemini-cli: timeout'))
      }
    }

    const timer = setTimeout(kill, timeout)

    child.stdout && child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr && child.stderr.on('data', (d) => (stderr += d.toString()))

    child.on('error', (err) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      reject(err)
    })

    child.on('close', (code) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

async function callProvider({ provider = 'gemini', prompt, opts = {} }) {
  const cliPath = process.env.GEMINI_CLI_PATH || 'gemini'
  const cliArgsEnv = process.env.GEMINI_CLI_ARGS || ''
  const cliArgs = cliArgsEnv.split(' ').filter(Boolean)
  const acceptStdin = String(process.env.GEMINI_CLI_ACCEPT_STDIN || '1') === '1'
  const timeout = parseInt(process.env.GEMINI_CLI_TIMEOUT_MS || '30000', 10)

  if (!prompt) prompt = ''

  if (acceptStdin) {
    // call CLI and write prompt to stdin
    const args = cliArgs.slice()
    const proc = spawnWithTimeout(cliPath, args, { stdio: ['pipe', 'pipe', 'pipe'] }, timeout)
    // spawnWithTimeout returns a promise, but we need to write to stdin first.
    // Simpler: spawn directly and attach handlers here to allow stdin write.
    return new Promise((resolve, reject) => {
      const child = spawn(cliPath, args, { stdio: ['pipe', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL') } catch (e) {}
        reject(new Error('gemini-cli: timeout'))
      }, timeout)

      child.stdout && child.stdout.on('data', (d) => (stdout += d.toString()))
      child.stderr && child.stderr.on('data', (d) => (stderr += d.toString()))

      child.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })

      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({ text: stdout.trim(), raw: { code, stderr }, usage: {} })
      })

      try {
        child.stdin.write(String(prompt))
        child.stdin.end()
      } catch (err) {
        clearTimeout(timer)
        try { child.kill('SIGKILL') } catch (e) {}
        reject(err)
      }
    })
  }

  // Else: write prompt to a temp file and pass its path as an argument
  const tmpDir = os.tmpdir()
  const filename = `gemini_prompt_${Date.now()}.txt`
  const filePath = path.join(tmpDir, filename)
  fs.writeFileSync(filePath, String(prompt), 'utf8')
  const args = cliArgs.concat([filePath])

  try {
    const result = await spawnWithTimeout(cliPath, args, { stdio: ['ignore', 'pipe', 'pipe'] }, timeout)
    // cleanup
    try { fs.unlinkSync(filePath) } catch (e) {}
    return { text: (result.stdout || '').trim(), raw: result, usage: {} }
  } catch (err) {
    try { fs.unlinkSync(filePath) } catch (e) {}
    throw err
  }
}

module.exports = { callProvider }
