import { useEffect, useRef } from 'react';
import { StudioProvider, useStudioTemplate } from './StudioStore';

const KEY_TEXT = 'studio2.template.v1';
const KEY_MODE = 'studio2.mode.v1';

function Bootstraper({ children }){
  const { templateText, setTemplateText, mode, setMode } = useStudioTemplate();
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return; initialized.current = true;
    try {
      const t = localStorage.getItem(KEY_TEXT); if (t) setTemplateText(t);
      const m = localStorage.getItem(KEY_MODE); if (m) setMode(m);
    } catch {}
  }, [setTemplateText, setMode]);
  useEffect(() => { try { localStorage.setItem(KEY_TEXT, templateText||''); } catch {} }, [templateText]);
  useEffect(() => { try { localStorage.setItem(KEY_MODE, mode||'code'); } catch {} }, [mode]);
  return children;
}

export default function StudioPersistentProvider({ children }){
  return (
    <StudioProvider>
      <Bootstraper>{children}</Bootstraper>
    </StudioProvider>
  );
}

