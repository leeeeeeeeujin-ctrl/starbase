import { useState } from 'react';
import { useStudioTemplate as useTemplate } from '../../contexts/StudioStore';

export default function ImageUiPanel({ onClose }){
  const { templateText, setTemplateText } = useTemplate();
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setBusy(true); setError('');
    try {
      // Stub: append a resource entry to backgrounds with the prompt for now
      const obj = JSON.parse(templateText || '{}');
      const bg = obj.resources?.backgrounds || [];
      const id = `bg_${Math.random().toString(36).slice(2,8)}`;
      const next = {
        ...obj,
        resources: { ...(obj.resources||{}), backgrounds: [...bg, { id, name: prompt || 'Generated', image: '' }] }
      };
      setTemplateText(JSON.stringify(next, null, 2));
      onClose?.();
    } catch(e){ setError(String(e.message||e)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.2)', zIndex:40 }}>
      <div style={{ position:'absolute', right:16, top:16, width:420, background:'#fff', border:'1px solid #ddd', borderRadius:10, boxShadow:'0 8px 28px rgba(0,0,0,0.15)', padding:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <strong>이미지로 UI 생성</strong>
          <button onClick={onClose}>닫기</button>
        </div>
        <div style={{ marginTop:8, display:'grid', gap:8 }}>
          <label>프롬프트</label>
          <textarea rows={6} value={prompt} onChange={e=> setPrompt(e.target.value)} style={{ width:'100%' }} />
          <button disabled={busy} onClick={generate}>생성(스텁)</button>
          {error && <div style={{ color:'#d33' }}>{error}</div>}
          <div style={{ fontSize:12, color:'#666' }}>현재는 스텁으로 backgrounds에 항목을 추가합니다. 실제 이미지 생성 연동은 이후 브리지/스토리지와 연결하세요.</div>
        </div>
      </div>
    </div>
  );
}
