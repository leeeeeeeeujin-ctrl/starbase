import React, { useEffect } from 'react';
import installPromptCreationGuard from '../lib/prompts/installPromptCreationGuard.js';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // Install client-side guard to dedupe prompt creation
    installPromptCreationGuard({ windowMs: 3000 });
  }, []);

  return (
    <>
      <style jsx global>{`
        html, body, #__next { height: 100%; background: #0b1220; }
        body { margin: 0; overflow: hidden; }
        *:focus { outline: none; }
        *:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
