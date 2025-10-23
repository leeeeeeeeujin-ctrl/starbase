#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const GLOB = ['components', 'hooks', 'pages', 'lib', 'modules']
const MATCH = '// eslint-disable-next-line react-hooks/exhaustive-deps -- auto-suppressed by codemod'

function walk(dir, files=[]) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (['.next','node_modules','reports'].includes(e.name)) continue
      walk(p, files)
    } else if (e.isFile() && p.endsWith('.js')) files.push(p)
  }
  return files
}

let changedFiles = 0
let removed = 0

for (const g of GLOB) {
  const dir = path.join(ROOT, g)
  if (!fs.existsSync(dir)) continue
  const files = walk(dir, [])
  for (const file of files) {
    let src = fs.readFileSync(file, 'utf8')
    const lines = src.split(/\r?\n/)
    let out = []
    for (let i=0;i<lines.length;i++) {
      const line = lines[i]
      if (line.trim() === MATCH) {
        // skip following identical matches
        out.push(line)
        let j = i+1
        let removedLocal = 0
        while (j < lines.length && lines[j].trim() === MATCH) {
          removedLocal++
          j++
        }
        if (removedLocal>0) removed += removedLocal
        i = j-1
      } else out.push(line)
    }
    const newSrc = out.join('\n')
    if (newSrc !== src) {
      fs.writeFileSync(file, newSrc, 'utf8')
      changedFiles++
    }
  }
}

console.log('Dedupe complete. Files changed:', changedFiles, 'lines removed:', removed)
