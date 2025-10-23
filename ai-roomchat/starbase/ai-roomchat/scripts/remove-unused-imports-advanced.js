#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const EXCLUDE = ['.git', 'node_modules', '.next', 'public', 'playwright-report', 'reports', 'supabase', 'scripts']
const EXT = ['.js', '.jsx', '.ts', '.tsx']

let filesChanged = 0
let importsRemoved = 0
let importsUpdated = 0

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

  // We'll collect edits by replacing import blocks conservatively.
  // Handle named imports (possibly multiline) and default+named combos.
  // Use global regex with dotAll to capture across lines.
  const importPattern = /(^\s*import\s+([\s\S]*?)\s*from\s*['"][^'"]+['"];?)/gm

  let changed = false
  let out = src
  let match
  // We will iterate matches from start to end; to avoid index shift issues, rebuild out progressively.
  const matches = []
  while ((match = importPattern.exec(src)) !== null) {
    matches.push({ full: match[1], spec: match[2], index: match.index })
  }

  // Process matches in reverse order so replacements don't affect earlier indices
  for (let i = matches.length - 1; i >= 0; i--) {
    const { full, spec } = matches[i]
    const importText = full
    const specText = spec.trim()

    // Detect forms:
    // 1) default + named: Foo, { A, B as C }
    // 2) named only: { A, B }
    // 3) default only or namespace import: handled conservatively by skipping namespace imports

    const defaultAndNamed = specText.match(/^([A-Za-z0-9_$]+)\s*,\s*\{([\s\S]*)\}$/s)
    const namedOnly = specText.match(/^\{([\s\S]*)\}$/s)
    const defaultOnly = specText.match(/^([A-Za-z0-9_$]+)\s*$/)
    const namespaceImport = specText.match(/^\*\s+as\s+([A-Za-z0-9_$]+)\s*$/)

    if (namespaceImport) {
      // skip namespace imports (conservative)
      continue
    }

    if (namedOnly || defaultAndNamed) {
      const defaultIdent = defaultAndNamed ? defaultAndNamed[1].trim() : null
      const namedList = (namedOnly ? namedOnly[1] : defaultAndNamed[2]).trim()
      // split by comma but allow multiline and comments
      const parts = namedList.split(',').map(s => s.trim()).filter(Boolean)
      const used = []
      const srcWithoutImport = src.replace(importText, '')
      for (const p of parts) {
        // handle alias: 'Foo as F'
        const m = p.match(/^([A-Za-z0-9_$]+)(\s+as\s+([A-Za-z0-9_$]+))?$/)
        if (!m) {
          // unrecognized pattern, keep conservatively
          used.push(p)
          continue
        }
        const originalName = m[1]
        const alias = m[3] ? m[3] : originalName
        const regex = new RegExp('\\b' + alias + '\\b', 'm')
        if (regex.test(srcWithoutImport)) {
          used.push(p)
        } else {
          // unused
          importsRemoved++
        }
      }

      if (used.length === 0 && !defaultIdent) {
        // remove entire import
        out = out.replace(importText, '')
        changed = true
      } else {
        // rebuild import text
        let rebuilt = ''
        if (defaultIdent) rebuilt += defaultIdent + ', '
        rebuilt += '{ ' + used.join(', ') + ' }'
        // find module specifier
        const mFrom = importText.match(/from\s*(['"][^'"]+['"]\s*;?)/)
        const fromPart = mFrom ? ' from ' + mFrom[1] : ''
        const newImport = 'import ' + rebuilt + fromPart
        out = out.replace(importText, newImport)
        if (used.length !== parts.length) {
          importsUpdated++
          changed = true
        }
      }
    } else if (defaultOnly) {
      // default import only: check usage
      const ident = defaultOnly[1]
      const srcWithoutImport = src.replace(importText, '')
      const regex = new RegExp('\\b' + ident + '\\b', 'm')
      if (!regex.test(srcWithoutImport)) {
        // remove import line
        out = out.replace(importText, '')
        importsRemoved++
        changed = true
      }
    } else {
      // Unhandled import forms (e.g., side-effect imports) - skip
      continue
    }
  }

  if (changed) {
    fs.writeFileSync(file, out, 'utf8')
    filesChanged++
    console.log(`Patched ${file}`)
  }
}

console.log('Scanning for unused imports (advanced, conservative)...')
walk(ROOT)
console.log(`Done. Files changed: ${filesChanged}, imports removed: ${importsRemoved}, imports updated: ${importsUpdated}`)
process.exit(0)
