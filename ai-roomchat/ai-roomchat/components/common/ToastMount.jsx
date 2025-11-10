"use client";

import React, { useEffect, useState } from 'react';

export default function ToastMount(){
  const [items, setItems] = useState([]); // { id, text, type }
  useEffect(() => {
    const add = (text, type='info', ms=1800) => {
      const id = Math.random().toString(36).slice(2);
      setItems(arr => [...arr, { id, text, type }]);
      setTimeout(() => setItems(arr => arr.filter(it => it.id !== id)), ms);
    };
    const onEvt = (e) => {
      try {
        const { text, type, ms } = (e && e.detail) || {};
        if (!text) return;
        add(String(text), type||'info', ms||1800);
      } catch {}
    };
    try { window.__toast = { show: (text, type, ms) => add(text, type, ms) }; } catch {}
    window.addEventListener('toast:show', onEvt);
    return () => {
      window.removeEventListener('toast:show', onEvt);
      try { delete window.__toast; } catch {}
    };
  }, []);
  if (!items.length) return null;
  return (
    <div style={{ position:'fixed', top:12, right:12, display:'grid', gap:8, zIndex: 1000 }}>
      {items.map(it => (
        <div key={it.id} style={{ padding:'8px 12px', borderRadius:8, border:'1px solid #334155', background: it.type==='error' ? '#3f1d2b' : (it.type==='success' ? '#122a1d' : '#0b1220'), color:'#e2e8f0', boxShadow:'0 2px 8px rgba(0,0,0,0.4)' }}>
          {it.text}
        </div>
      ))}
    </div>
  );
}

