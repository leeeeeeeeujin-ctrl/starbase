import { createContext, useContext, useState } from 'react';

const StudioContext = createContext(null);

export function StudioProvider({ children }) {
  const [templateText, setTemplateText] = useState('');
  const [mode, setMode] = useState('code');
  const value = { templateText, setTemplateText, mode, setMode };
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudioTemplate() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudioTemplate must be used within StudioProvider');
  return ctx;
}

