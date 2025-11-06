import { useEffect, useMemo, useRef, useState } from 'react';
import VirtualList from '../common/VirtualList';
import { useStudioTemplate as useTemplate } from '../../contexts/StudioStore';

function safeParse(jsonText) {
  try { return JSON.parse(jsonText || '{}'); } catch { return {}; }
}

const buckets = [
  { key: 'characters', label: 'Characters' },
  { key: 'skills', label: 'Skills' },
  { key: 'items', label: 'Items' },
  { key: 'music', label: 'Music' },
  { key: 'backgrounds', label: 'Backgrounds' },
  { key: 'custom', label: 'Custom' },
];

export default function UIEditor() {
  const { templateText, setTemplateText } = useTemplate();
  const tpl = useMemo(() => safeParse(templateText), [templateText]);
  const resources = tpl.resources || {};
  const [active, setActive] = useState('characters');
  const commitRef = useRef(null);

  const commit = (nextObj) => {
    if (commitRef.current) clearTimeout(commitRef.current);
    commitRef.current = setTimeout(() => setTemplateText(JSON.stringify(nextObj, null, 2)), 150);
  };

  const setResources = (next) => {
    const nextTpl = { ...tpl, resources: next };
    commit(nextTpl);
  };

  // persist active bucket
  useEffect(() => {
    try { const v = localStorage.getItem('studio.ui.active'); if (v) setActive(v); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('studio.ui.active', active); } catch {}
  }, [active]);

  const list = Array.isArray(resources[active]) ? resources[active] : [];

  const addItem = () => {
    const id = `${active}_${Math.random().toString(36).slice(2,8)}`;
    const item = { id, name: `New ${active.slice(0, -1)}` };
    const next = { ...resources, [active]: [...list, item] };
    setResources(next);
  };

  const removeItem = (id) => {
    const next = { ...resources, [active]: list.filter(x => x.id !== id) };
    setResources(next);
  };

  const updateItem = (id, patch) => {
    const next = { ...resources, [active]: list.map(x => x.id === id ? { ...x, ...patch } : x) };
    setResources(next);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: '100%' }}>
      <div style={{ borderRight: '1px solid #eee', padding: 12, overflow: 'auto' }}>
        <div style={{ display: 'grid', gap: 6 }}>
          {buckets.map(b => (
            <button key={b.key} onClick={() => setActive(b.key)} disabled={active===b.key} style={{ padding: '10px 12px' }}>{b.label}</button>
          ))}
        </div>
        <div style={{ height: 12 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={addItem} style={{ padding: '10px 12px' }}>+ Add</button>
        </div>
        <div style={{ marginTop: 12 }}>
          {list.length === 0 && <div style={{ color: '#666' }}>No {active}.</div>}
          {list.length > 0 && (
            <VirtualList
              count={list.length}
              itemHeight={active === 'music' ? 180 : 220}
              height={420}
              renderItem={(i) => {
                const x = list[i];
                return (
                  <div key={x.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 16 }}>{x.name || x.id}</strong>
                      <button onClick={() => removeItem(x.id)} style={{ padding: '8px 10px' }}>Remove</button>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <label>Name</label>
                      <input value={x.name || ''} onChange={e => updateItem(x.id, { name: e.target.value })} style={{ width: '100%', padding: '10px 12px' }} />
                    </div>
                    {(active === 'characters' || active === 'items' || active === 'backgrounds') && (
                      <div style={{ marginTop: 10 }}>
                        <label>Image URL</label>
                        <input value={x.image || ''} onChange={e => updateItem(x.id, { image: e.target.value })} style={{ width: '100%', padding: '10px 12px' }} />
                        {x.image ? (
                          <div style={{ marginTop: 8 }}>
                            <img alt={x.name||x.id} src={x.image} loading="lazy" style={{ maxWidth: '100%', borderRadius: 6, border: '1px solid #eee' }} />
                          </div>
                        ) : null}
                      </div>
                    )}
                    {active === 'music' && (
                      <div style={{ marginTop: 10 }}>
                        <label>Audio URL</label>
                        <input value={x.audio || ''} onChange={e => updateItem(x.id, { audio: e.target.value })} style={{ width: '100%', padding: '10px 12px' }} />
                        {x.audio ? (
                          <div style={{ marginTop: 8 }}>
                            <audio controls src={x.audio} style={{ width: '100%' }} />
                          </div>
                        ) : null}
                      </div>
                    )}
                    <div style={{ marginTop: 10 }}>
                      <label>Meta (JSON)</label>
                      <textarea
                        rows={6}
                        value={JSON.stringify(x.meta ?? {}, null, 2)}
                        onChange={e => { try { updateItem(x.id, { meta: JSON.parse(e.target.value || '{}') }); } catch {} }}
                        style={{ width: '100%', fontFamily: 'monospace', padding: '10px 12px' }}
                      />
                    </div>
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>
      <div style={{ padding: 16, overflow: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Preview</h3>
        <div style={{ color: '#666', fontSize: 14 }}>template.resources.{active} 내용이 우측에 표시됩니다. 이미지/오디오 URL을 넣으면 미리보기가 보입니다.</div>
      </div>
    </div>
  );
}
