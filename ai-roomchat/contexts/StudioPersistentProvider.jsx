import { useEffect, useRef } from 'react';
import { StudioProvider, useStudioTemplate } from './StudioStore';

function storageKeyFor(kind) {
  if (typeof window === 'undefined') {
    return `studio2.${kind}.v1`;
  }
  const scope = window.location.pathname || 'global';
  return `studio2.${kind}.v1@${scope}`;
}

function Bootstraper({ children }){
  const { templateText, setTemplateText, mode, setMode } = useStudioTemplate();
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return; initialized.current = true;
    try {
      const textKey = storageKeyFor('template');
      const modeKey = storageKeyFor('mode');
      // URL query can override initial mode (e.g., /studio?mode=ui)
      try {
        const u = new URL(window.location.href);
        const qm = (u.searchParams.get('mode') || '').toLowerCase();
        if (qm === 'code' || qm === 'nodes' || qm === 'ui') {
          setMode(qm);
        }
      } catch {}
      const t = localStorage.getItem(textKey); if (t) setTemplateText(t);
      const m = localStorage.getItem(modeKey); if (m) setMode(m);
    } catch {}
  }, [setTemplateText, setMode]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKeyFor('template'), templateText || '');
    } catch {}
  }, [templateText]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKeyFor('mode'), mode || 'code');
    } catch {}
  }, [mode]);
  return children;
}

export default function StudioPersistentProvider({ children }){
  return (
    <StudioProvider>
      <Bootstraper>{children}</Bootstraper>
    </StudioProvider>
  );
}
