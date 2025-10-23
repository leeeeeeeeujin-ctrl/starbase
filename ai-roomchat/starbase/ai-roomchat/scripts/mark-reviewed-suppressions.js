#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const MATCH = "// eslint-disable-next-line react-hooks/exhaustive-deps -- auto-suppressed by codemod"
const NOTE = [
  '  // NOTE: auto-suppressed by codemod. This suppression was added by automated',
  '  // tooling to reduce noise. Please review the surrounding effect body and',
  '  // either add the minimal safe dependencies or keep the suppression with',
  '  // an explanatory comment before removing this note.'
].join('\n')

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (['.next', 'node_modules', 'reports'].includes(e.name)) continue
      walk(p, files)
    } else if (e.isFile() && (p.endsWith('.js') || p.endsWith('.jsx') || p.endsWith('.ts') || p.endsWith('.tsx'))) {
      files.push(p)
    }
  }
  return files
}

let filesChanged = 0
let insertions = 0

const files = walk(ROOT)
for (const file of files) {
  let src = fs.readFileSync(file, 'utf8')
  if (!src.includes(MATCH)) continue
  const lines = src.split(/\r?\n/)
  let changed = false
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === MATCH) {
      // check previous non-empty line for existing NOTE to avoid duplicate
      let prev = i - 1
      while (prev >= 0 && lines[prev].trim() === '') prev--
      if (prev >= 0 && lines[prev].includes('NOTE: auto-suppressed')) {
        continue
      }
      lines.splice(i, 0, NOTE)
      insertions++
      changed = true
      i += NOTE.split('\n').length // skip over inserted lines
    }
  }
  if (changed) {
    fs.writeFileSync(file, lines.join('\n'), 'utf8')
    filesChanged++
  }
}

console.log('Mark reviewed suppressions: files changed:', filesChanged, 'insertions:', insertions)
