// /components/rank/StartScaffold.js
import ParticipantsPanel from './ParticipantsPanel'
import ResultSheet from './ResultSheet'
import SharedChatDock from '@/components/common/SharedChatDock'

export default function StartScaffold({
  preflight, grouped, starting, onStart, onExit,
  center,
}) {
  return (
    <div style={{ display:'grid', gridTemplateRows:'auto 1fr auto', gap:12 }}>
      {/* 중앙 영역을 주입(center)해서 엔진/채팅 교체 가능 */}
      {preflight && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:50
        }}>
          <div style={{ background:'#fff', borderRadius:12, padding:16, width:'min(920px, 92vw)', maxHeight:'80vh', overflow:'auto' }}>
            <h3 style={{ marginTop:0, marginBottom:12 }}>참여자 확인</h3>
            <ResultSheet grouped={grouped} />
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
              <button onClick={onExit} style={{ padding:'8px 12px' }}>← 돌아가기</button>
              <button onClick={onStart} disabled={starting} style={{ padding:'8px 12px', background:'#111827', color:'#fff', borderRadius:8 }}>
                {starting ? '시작 중…' : '게임 시작'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{
        display:'grid',
        gridTemplateColumns: preflight ? '1fr' : '1fr minmax(360px, 640px) 1fr',
        gap:12, transition:'all .25s ease'
      }}>
        <div>{!preflight && <ParticipantsPanel grouped={grouped.slice(0, Math.ceil(grouped.length/2))} />}</div>
        <div>{center}</div>
        <div>{!preflight && <ParticipantsPanel grouped={grouped.slice(Math.ceil(grouped.length/2))} />}</div>
      </div>

      <SharedChatDock height={preflight ? 240 : 320} />
    </div>
  )
}
