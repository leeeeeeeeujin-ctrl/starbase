// Ensure a global guard exists in both SSR and browser to prevent
// ReferenceError from legacy `extensionsOpen` references.
try {
  if (typeof globalThis !== 'undefined') {
    if (typeof globalThis.__EXT_OPEN__ === 'undefined') globalThis.__EXT_OPEN__ = false;
    if (typeof globalThis.extensionsOpen === 'undefined') globalThis.extensionsOpen = globalThis.__EXT_OPEN__;
  }
} catch (_) {}

import ExtensionsHost from '../components/workspace/ExtensionsHost';
import '../styles/globals.css';

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <ExtensionsHost />
    </>
  );
}
