// lib/outcome.js
const WIN_WORDS = ['승', '승리', 'win', 'victory']
const LOSE_WORDS = ['패', '패배', 'lose', 'defeat']
const OUT_WORDS = ['탈락', 'out', 'eliminate']


export function parseOutcome({ aiText, participants }) {
const last = (aiText || '').trim().split(/\r?\n/).slice(-1)[0] || ''
const norm = last.toLowerCase()
const out = []


for (const p of participants) {
  const name = p.heroes?.name || p.name || p.hero_name || ''
if (!name) continue
if (!last.includes(name)) continue


let result = null
if (WIN_WORDS.some(w => norm.includes(w))) result = 'win'
else if (LOSE_WORDS.some(w => norm.includes(w))) result = 'lose'
else if (OUT_WORDS.some(w => norm.includes(w))) result = 'lose'


if (result) out.push({ hero_id: p.hero_id || p.heroes?.id, role: p.role, result })
}
return out
}