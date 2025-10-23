#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const REPORT = path.resolve(__dirname, '..', 'reports', 'eslint-report-clean.json')
const SKIP_DIRS = ['.next', 'node_modules', 'reports', 'scripts']

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { console.error('Failed read', p, e.message); process.exit(2) }
}

function shouldSkip(file) {
  return SKIP_DIRS.some(d => file.includes(path.sep + d + path.sep) || file.includes(path.posix.sep + d + path.posix.sep))
}

function extractDepsLine(lines, commentLineIndex) {
  // The dependency array is usually immediately after the inserted comment
  for (let i = commentLineIndex + 1; i < Math.min(lines.length, commentLineIndex + 6); i++) {
    const l = lines[i]
    const m = l.match(/\[(.*)\]/)
    if (m) return { idx: i, raw: m[1].trim() }
  }
  return null
}

function findHookStart(lines, depIdx) {
  // search backwards for useEffect/useMemo/useCallback start
  for (let i = depIdx; i >= Math.max(0, depIdx - 200); i--) {
    if (/useEffect\s*\(|useMemo\s*\(|useCallback\s*\(/.test(lines[i])) return i
  }
  return null
}

function extractIdentifiers(text) {
  // crude identifier extraction; skip JS keywords and numbers
  const ignore = new Set(['if','for','while','return','const','let','var','new','try','catch','function','=>'])
  const ids = new Set()
  const re = /\b([A-Za-z_$][\w$]*)\b/g
  let m
  while ((m = re.exec(text))) {
    const id = m[1]
    if (/^[A-Z]/.test(id)) continue // likely component/class/constructor
    if (/^window$|^document$|^console$/.test(id)) continue
    if (!/^[0-9]/.test(id) && !ignore.has(id)) ids.add(id)
  }
  return Array.from(ids)
}

function normalizeDeps(raw) {
  if (!raw) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

function backupFile(file) {
  const bak = file + '.bak'
  if (!fs.existsSync(bak)) fs.copyFileSync(file, bak)
}

function run() {
  if (!fs.existsSync(REPORT)) { console.error('Report missing', REPORT); process.exit(1) }
  const data = readJson(REPORT)
  const entries = data.flatMap(entry => (entry.messages||[]).filter(m => m.ruleId === 'react-hooks/exhaustive-deps').map(m => ({ file: entry.filePath, line: m.line })))
  const byFile = {}
  for (const e of entries) {
    if (shouldSkip(e.file)) continue
    byFile[e.file] = byFile[e.file] || new Set()
    byFile[e.file].add(e.line)
  }

  const report = { filesScanned: 0, autoFixed: [], recommendations: [] }

  for (const [file, linesSet] of Object.entries(byFile)) {
    report.filesScanned++
    if (!fs.existsSync(file)) { report.recommendations.push({ file, reason: 'missing file' }); continue }
    const src = fs.readFileSync(file, 'utf8')
    const lines = src.split(/\r?\n/)
    const linesArr = Array.from(linesSet).sort((a,b)=>a-b)
    let fileChanged = false
    for (const reportedLine of linesArr) {
      const commentIdx = reportedLine - 1 // our comment was inserted at the reported line
      const deps = extractDepsLine(lines, commentIdx)
      if (!deps) { report.recommendations.push({ file, line: reportedLine, reason: 'deps not found' }); continue }
      const depArray = normalizeDeps(deps.raw)
      const hookStart = findHookStart(lines, deps.idx)
      if (hookStart === null) { report.recommendations.push({ file, line: reportedLine, reason: 'hook start not found' }); continue }
      // take the body between hookStart and deps.idx
      const body = lines.slice(hookStart, deps.idx).join('\n')
      const ids = extractIdentifiers(body)
      const missing = ids.filter(id => !depArray.includes(id))
      // filter out common hook names and local declarations
      const filtered = missing.filter(id => !['props','state','setState','dispatch'].includes(id))
      if (filtered.length === 1) {
        // very conservative: single missing identifier — auto add
        const add = filtered[0]
        // modify the dep line to include add
        const orig = lines[deps.idx]
        const newLine = orig.replace(/\[(.*)\]/, (m, inside) => {
          const items = normalizeDeps(inside)
          items.push(add)
          return '[' + Array.from(new Set(items)).join(', ') + ']' })
        backupFile(file)
        lines[deps.idx] = newLine
        fileChanged = true
        report.autoFixed.push({ file, line: deps.idx+1, added: add })
      } else {
        report.recommendations.push({ file, line: reportedLine, candidates: filtered.slice(0,5) })
      }
    }
    if (fileChanged) {
      fs.writeFileSync(file, lines.join('\n'), 'utf8')
    }
  }

  console.log('Analysis complete:', JSON.stringify(report, null, 2))
}

run()
