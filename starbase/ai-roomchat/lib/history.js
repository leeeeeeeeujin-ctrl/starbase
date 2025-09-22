// lib/history.js
// 세션별 AI 히스토리 관리

export function createAiHistory() {
  const rows = []

  function beginSession() { rows.length = 0 }
  function push({ role, content, public:pub }) {
    rows.push({ role, content:String(content||''), public:!!pub })
  }
  function joinedText({ onlyPublic=false, last=null }={}) {
    const src = onlyPublic ? rows.filter(r=>r.public) : rows
    const pick = last ? src.slice(-last) : src
    return pick.map(r=>r.content).join('\n')
  }
  function getAll() { return [...rows] }

  return { beginSession, push, joinedText, getAll }
}
