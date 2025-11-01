import { useEffect, useRef } from 'react';
import { TemplateProvider, useTemplate } from './TemplateStore';

const KEY_TEXT = 'studio.template.v1';
const KEY_MODE = 'studio.mode.v1';
export const DEFAULT_TEMPLATE_OBJECT = {
  name: 'New Template',
  variables: { difficulty: 'normal' },
  nodes: [
    { id: 'start', label: 'Start', position: { x: 60, y: 60 }, data: {} },
    { id: 'battle', label: 'Battle', position: { x: 260, y: 80 }, data: {} },
    { id: 'reward', label: 'Reward', position: { x: 460, y: 120 }, data: {} },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'battle', label: 'go' },
    { id: 'e2', source: 'battle', target: 'reward', label: 'win' },
  ],
  resources: {
    characters: [{ id: 'hero', name: 'Hero' }],
    skills: [{ id: 'slash', name: 'Slash' }],
    items: [{ id: 'potion', name: 'Potion' }],
    music: [], backgrounds: [], custom: []
  }
};
export const DEFAULT_TEMPLATE = JSON.stringify(DEFAULT_TEMPLATE_OBJECT, null, 2);

function Bootstraper({ children }){
  const { templateText, setTemplateText, mode, setMode } = useTemplate();
  const initialized = useRef(false);

  // Load once on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      const storedText = typeof window !== 'undefined' ? localStorage.getItem(KEY_TEXT) : null;
      if (storedText) {
        try { JSON.parse(storedText); setTemplateText(storedText); } catch {}
      } else {
        // seed with default template
        setTemplateText(DEFAULT_TEMPLATE);
      }
      const storedMode = typeof window !== 'undefined' ? localStorage.getItem(KEY_MODE) : null;
      if (storedMode) setMode(storedMode);
    } catch {}
  }, [setTemplateText, setMode]);

  // Persist on changes (debounced minimal)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = setTimeout(() => {
      try { localStorage.setItem(KEY_TEXT, templateText || ''); } catch {}
    }, 200);
    return () => clearTimeout(id);
  }, [templateText]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(KEY_MODE, mode || 'code'); } catch {}
  }, [mode]);

  return children;
}

export default function PersistentTemplateProvider({ children }){
  return (
    <TemplateProvider>
      <Bootstraper>{children}</Bootstraper>
    </TemplateProvider>
  );
}
