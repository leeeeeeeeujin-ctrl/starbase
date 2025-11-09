import { useState } from 'react';

export default function BlockCodingPanel({ onClose }){
  const [note] = useState('블록코딩 에디터 자리입니다. 현재는 스텁 UI로 제공됩니다.');
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.2)', zIndex:40 }}>
      <div style={{ position:'absolute', right:16, top:64, width:480, height:560, background:'#fff', border:'1px solid #ddd', borderRadius:10, boxShadow:'0 8px 28px rgba(0,0,0,0.15)', padding:12, display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <strong>블록코딩</strong>
          <button onClick={onClose}>닫기</button>
        </div>
        <div style={{ marginTop:8, color:'#444' }}>{note}</div>
        <div style={{ marginTop:12, fontSize:12, color:'#666' }}>추후 Blockly/ReactFlow 기반의 블록 에디터와 템플릿 변환기를 연결합니다.</div>
      </div>
    </div>
  );
}

