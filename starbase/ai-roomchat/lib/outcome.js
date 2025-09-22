// lib/outcome.js
const WIN_WORDS = ['승', '승리', 'win', 'victory']
const LOSE_WORDS = ['패', '패배', 'lose', 'defeat']
const OUT_WORDS = ['탈락', 'out', 'eliminate']

export function parseOutcome({ aiText, participants }) {
  // 마지막 줄만 본다(규칙에 따라 마지막 줄에만 판단 기입)
  const last = (aiText || '').trim().split(/\r?\n/).slice(-1)[0] || ''
  const norm = last.toLowerCase()

  // 이름 매칭(간단 포함 매칭)
  const out = []
  for (const p of participants) {
    const name = p.heroes?.name || ''
    if (!name) continue
    const hitName = last.includes(name)
    if (!hitName) continue

    let result = null
    if (WIN_WORDS.some(w => norm.includes(w))) result = 'win'
    else if (LOSE_WORDS.some(w => norm.includes(w))) result = 'lose'
    else if (OUT_WORDS.some(w => norm.includes(w))) result = 'lose' // 탈락=패
    if (result) out.push({ hero_id: p.hero_id || p.heroes?.id, role: p.role, result })
  }

  // 아무도 명시 안되면 빈 배열(=미판정)
  return out
}
