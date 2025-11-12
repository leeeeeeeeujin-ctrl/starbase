import { Html, Head, Main, NextScript } from 'next/document';
import Script from 'next/script';

const DEFAULT_MONACO_BASE = '/monaco/vs';
const rawBase = process.env.NEXT_PUBLIC_MONACO_BASE_URL?.trim();
const MONACO_BASE = rawBase && rawBase.length > 0 ? rawBase : DEFAULT_MONACO_BASE;
const MONACO_BASE_SCRIPT_VALUE = JSON.stringify(MONACO_BASE);

export default function Document() {
  return (
    <Html lang="ko">
      <Head>
        <meta name="mobile-web-app-capable" content="yes" />
        <Script id="monaco-env-setup" strategy="beforeInteractive">
          {`
            (function () {
              var rawBase = ${MONACO_BASE_SCRIPT_VALUE};
              function resolveOrigin() {
                if (typeof window === 'undefined') return '';
                if (window.location && window.location.origin) return window.location.origin;
                var protocol = window.location ? window.location.protocol : 'https:';
                var host = window.location ? window.location.host : '';
                return protocol && host ? protocol + '//' + host : '';
              }
              function normaliseBase(input) {
                if (!input) return resolveOrigin() + '/monaco/vs';
                var trimmed = String(input).trim();
                if (!trimmed) return resolveOrigin() + '/monaco/vs';
                if (/^https?:\\/\\//i.test(trimmed)) return trimmed.replace(/\\/+$/, '');
                if (trimmed.startsWith('//')) {
                  return (window.location ? window.location.protocol : 'https:') + trimmed;
                }
                if (trimmed.startsWith('/')) {
                  return resolveOrigin() + trimmed;
                }
                return trimmed;
              }
              function createWorkerBlob(base, label) {
                if (typeof URL === 'function' && typeof Blob === 'function') {
                  var source =
                    "self.MonacoEnvironment = self.MonacoEnvironment || {};" +
                    "self.MonacoEnvironment.baseUrl = '" + base + "';" +
                    "self.MONACO_WORKER_LABEL = '" + label + "';" +
                    "importScripts('" + base + "/base/worker/workerMain.js');";
                  try {
                    return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
                  } catch (err) {
                    console.error('[monaco] failed to create worker blob', err);
                  }
                }
                return null;
              }
              function assignEnvironment() {
                if (typeof window === 'undefined') return;
                var base = normaliseBase(rawBase);
                window.__MONACO_BASE_URL__ = base;
                var env = window.MonacoEnvironment || {};
                env.baseUrl = base;
                env.getWorkerUrl = function (moduleId, label) {
                  var blobUrl = createWorkerBlob(base, label || '');
                  return blobUrl || base + '/base/worker/workerMain.js';
                };
                window.MonacoEnvironment = env;
                window.__MONACO_ENV_READY__ = true;
              }
              assignEnvironment();
              window.__MONACO_ASSIGN_ENV__ = assignEnvironment;
            })();
          `}
        </Script>
        <Script src={`${MONACO_BASE}/loader.js`} strategy="beforeInteractive" />
        <Script id="monaco-env" strategy="beforeInteractive">
          {`
            (function () {
              var rawBase = ${MONACO_BASE_SCRIPT_VALUE};
              function resolveOrigin() {
                if (typeof window === 'undefined') return '';
                if (window.location && window.location.origin) return window.location.origin;
                var protocol = window.location ? window.location.protocol : 'https:';
                var host = window.location ? window.location.host : '';
                return protocol && host ? protocol + '//' + host : '';
              }
              function normaliseBase(input) {
                if (!input) return resolveOrigin() + '/monaco/vs';
                var trimmed = String(input).trim();
                if (!trimmed) return resolveOrigin() + '/monaco/vs';
                if (/^https?:\\/\\//i.test(trimmed)) return trimmed.replace(/\\/+$/, '');
                if (trimmed.startsWith('//')) {
                  return (window.location ? window.location.protocol : 'https:') + trimmed;
                }
                if (trimmed.startsWith('/')) {
                  return resolveOrigin() + trimmed;
                }
                return trimmed;
              }
              function joinPath(base, segment) {
                var left = (base || '').replace(/\\/+$/, '');
                var right = (segment || '').replace(/^\\/+/, '');
                return left + '/' + right;
              }
              function setup() {
                if (typeof window === 'undefined') return;
                var base = normaliseBase(rawBase);
                if (typeof window.__MONACO_ASSIGN_ENV__ === 'function') {
                  window.__MONACO_ASSIGN_ENV__();
                } else {
                  window.__MONACO_BASE_URL__ = base;
                }
                function ensure() {
                  if (typeof window.require !== 'function') {
                    setTimeout(ensure, 20);
                    return;
                  }
                  if (window.__MONACO_BOOTSTRAPPED__) return;
                  window.__MONACO_BOOTSTRAPPED__ = true;
                  if (!window.__MONACO_INIT__) {
                    window.__MONACO_INIT__ = new Promise(function (resolve, reject) {
                      try {
                        window.require.config({ paths: { vs: base } });
                      } catch (configErr) {
                        console.error('[monaco] require.config failed', configErr);
                        reject(configErr);
                        return;
                      }
                      try {
                        window.require(['vs/editor/editor.main'], function (monaco) {
                          if (monaco && monaco.editor) {
                            window.monaco = monaco;
                            resolve(monaco);
                          } else {
                            var err = new Error('monaco_missing_editor');
                            console.error('[monaco] editor missing after require', err);
                            reject(err);
                          }
                        }, function (err) {
                          console.error('[monaco] require failed', err);
                          reject(err);
                        });
                      } catch (requireErr) {
                        console.error('[monaco] require threw', requireErr);
                        reject(requireErr);
                      }
                    });
                  }
                }
                ensure();
              }
              setup();
            })();
          `}
        </Script>
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
