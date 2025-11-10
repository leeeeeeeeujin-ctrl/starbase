"use client";

import React, { useEffect, useState } from 'react';

export default function ToastMount() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onShow = (e) => {
      try {
        const d = e?.detail || {};
        const id = `t_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
        const life = Math.max(1200, Number(d.ms || 2200));
        const until = Date.now() + life;
        setItems((arr) => [...arr, { id, text: String(d.text||''), type: d.type||'info', until }]);
        setTimeout(() => setItems((arr) => arr.filter((x) => x.id !== id)), life + 50);
      } catch {}
    };
    window.addEventListener('toast:show', onShow);
    return () => window.removeEventListener('toast:show', onShow);
  }, []);

  if (!items.length) return null;
  return (
    <div style={{ position:'fixed', right:12, top:12, display:'grid', gap:8, zIndex: 2000 }}>
      {items.map((t) => (
        <div key={t.id} style={{ padding:'8px 10px', borderRadius:8, border:'1px solid #334155', background: t.type==='error' ? '#3f1d1d' : (t.type==='success' ? '#064e3b' : '#0b1220'), color: t.type==='error' ? '#fecaca' : (t.type==='success' ? '#d1fae5' : '#e2e8f0'), boxShadow:'0 6px 24px rgba(0,0,0,0.45)', minWidth: 220 }}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

