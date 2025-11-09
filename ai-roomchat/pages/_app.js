import React, { useEffect } from 'react';
import installPromptCreationGuard from '../lib/prompts/installPromptCreationGuard.js';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // Install client-side guard to dedupe prompt creation
    installPromptCreationGuard({ windowMs: 3000 });
  }, []);

  return <Component {...pageProps} />;
}

