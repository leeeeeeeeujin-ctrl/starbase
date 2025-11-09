import React, { createContext, useContext, useEffect, useState } from 'react';
import { detectCapabilities } from '@/lib/client/capabilities/detect';

const ClientCapabilitiesContext = createContext({ ready: false, caps: {} });

export function ClientCapabilitiesProvider({ children }) {
  const [state, setState] = useState({ ready: false, caps: {} });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const caps = await detectCapabilities();
        if (!cancelled) setState({ ready: true, caps });
      } catch (e) {
        if (!cancelled) setState({ ready: true, caps: { error: e.message } });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <ClientCapabilitiesContext.Provider value={state}>
      {children}
    </ClientCapabilitiesContext.Provider>
  );
}

export function useCapabilities() {
  return useContext(ClientCapabilitiesContext);
}
