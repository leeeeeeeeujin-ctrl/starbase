"use client";

import * as React from 'react';
import UISchemaRenderer from "../ui/UISchemaRenderer.jsx";

function safeParse(jsonStr){
  try { return JSON.parse(String(jsonStr||'{}')); } catch { return {}; }
}

// def: { type: 'ui'|'script', path: '/game/pages/ui/...' }
function loadDefOutput(def, files){
  try {
    if (!def || !def.path) return { schema:null, handlers:null };
    if (def.type === 'ui') {
      const schema = safeParse(files?.[def.path]?.content || '{}');
      return { schema, handlers:null };
    }
    if (def.type === 'script') {
      const src = String(files?.[def.path]?.content || '');
      const fn = new Function(`${src}; return (typeof render==='function')?render:undefined;`);
      const render = fn();
      if (typeof render === 'function') {
        const out = render({ files });
        if (out && typeof out === 'object') return { schema: out.schema || null, handlers: out.handlers || null };
      }
    }
    return { schema:null, handlers:null };
  } catch { return { schema:null, handlers:null }; }
}

export default function DynamicSlot({ slotId, files, resolveAsset, defaultRender }){
  const tpl = safeParse(files?.['/template.json']?.content || '{}');
  const def = tpl?.ui?.overrides?.[slotId] || null;
  const [schema, setSchema] = React.useState(null);
  const handlersRef = React.useRef({});

  React.useEffect(() => {
    try {
      if (!def) { setSchema(null); handlersRef.current = {}; return; }
      const { schema: sc, handlers } = loadDefOutput(def, files);
      setSchema(sc || null);
      handlersRef.current = handlers || {};
    } catch { setSchema(null); handlersRef.current = {}; }
  }, [JSON.stringify(def), files]);

  const onEvent = React.useCallback((name, payload) => {
    try { const fn = handlersRef.current?.[name]; if (typeof fn==='function') fn(payload); } catch {}
  }, []);

  if (schema) {
    return <UISchemaRenderer schema={schema} onEvent={onEvent} resolveAsset={resolveAsset} />;
  }
  return typeof defaultRender === 'function' ? defaultRender() : null;
}
