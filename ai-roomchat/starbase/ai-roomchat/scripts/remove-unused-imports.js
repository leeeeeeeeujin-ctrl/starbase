#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const EXCLUDE = ['.git', 'node_modules', '.next', 'public', 'playwright-report', 'reports', 'supabase']
const EXT = ['.js', '.jsx', '.ts', '.tsx']

let filesChanged = 0
let importsRemoved = 0

function shouldSkip(filePath) {
  const rel = path.relative(ROOT, filePath)
  if (!rel) return true
  const parts = rel.split(path.sep)
  if (parts.some(p => EXCLUDE.includes(p))) return true
  return false
}

function walk(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true })
  for (const it of items) {
    const full = path.join(dir, it.name)
    if (shouldSkip(full)) continue
    if (it.isDirectory()) walk(full)
    else if (it.isFile() && EXT.includes(path.extname(it.name))) processFile(full)
  }
}

function processFile(file) {
  let src = fs.readFileSync(file, 'utf8')
  const original = src
  const lines = src.split(/\r?\n/)
  let changed = false
  const newLines = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // match simple default import: import Foo from '...'
    const mDefault = line.match(/^\s*import\s+([A-Za-z0-9_$]+)\s+from\s+['"][^'"]+['"];?\s*$/)
    if (mDefault) {
      const ident = mDefault[1]
      const rest = lines.slice(0, i).concat(lines.slice(i + 1)).join('\n')
      // check occurrence of ident in rest (word boundary)
      const regex = new RegExp('\\b' + ident + '\\b', 'm')
      if (!regex.test(rest)) {
        // remove import
        changed = true
        importsRemoved++
        continue
      }
    }

    // match single named import: import { Foo } from '...'
    const mNamed = line.match(/^\s*import\s+\{\s*([A-Za-z0-9_$]+)\s*\}\s+from\s+['"][^'"]+['"];?\s*$/)
    if (mNamed) {
      const ident = mNamed[1]
      const rest = lines.slice(0, i).concat(lines.slice(i + 1)).join('\n')
      const regex = new RegExp('\\b' + ident + '\\b', 'm')
      if (!regex.test(rest)) {
        changed = true
        importsRemoved++
        continue
      }
    }

    newLines.push(line)
  }

  if (changed) {
    fs.writeFileSync(file, newLines.join('\n'), 'utf8')
    filesChanged++
    console.log(`Patched ${file}`)
  }
}

console.log('Scanning for unused simple imports...')
walk(ROOT)
console.log(`Done. Files changed: ${filesChanged}, imports removed: ${importsRemoved}`)
process.exit(0)
