import { createContext, useContext, useState } from 'react';

const TemplateContext = createContext(null);

export function TemplateProvider({ children }) {
  const [templateText, setTemplateText] = useState('');
  const [mode, setMode] = useState('code');

  const value = {
    templateText,
    setTemplateText,
    mode,
    setMode,
  };
  return <TemplateContext.Provider value={value}>{children}</TemplateContext.Provider>;
}

export function useTemplate() {
  const ctx = useContext(TemplateContext);
  if (!ctx) throw new Error('useTemplate must be used within TemplateProvider');
  return ctx;
}

