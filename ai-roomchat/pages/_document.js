import { Html, Head, Main, NextScript } from 'next/document';
import Script from 'next/script';

const DEFAULT_MONACO_ROOT = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min';
const rawBase = process.env.NEXT_PUBLIC_MONACO_BASE_URL?.trim();
const MONACO_ROOT = rawBase && rawBase.length > 0 ? rawBase : DEFAULT_MONACO_ROOT;
const MONACO_VS = `${MONACO_ROOT.replace(/\/$/, '')}/vs`;
const MONACO_ROOT_SCRIPT_VALUE = JSON.stringify(MONACO_ROOT);
const MONACO_VS_SCRIPT_VALUE = JSON.stringify(MONACO_VS);

export default function Document() {
  return (
    <Html lang="ko">
      <Head>
        <meta name="mobile-web-app-capable" content="yes" />
        <Script id="monaco-env-setup" strategy="beforeInteractive">
          {`
            (function () {
              var baseRoot = ${MONACO_ROOT_SCRIPT_VALUE};
              function resolveOrigin() {
                if (typeof window === 'undefined') return '';
                if (window.location && window.location.origin) return window.location.origin;
                var protocol = window.location ? window.location.protocol : 'https:';
                var host = window.location ? window.location.host : '';
                return protocol && host ? protocol + '//' + host : '';
              }
              function normaliseBase(input) {
                if (!input) return resolveOrigin() + '/monaco';
                var trimmed = String(input).trim();
                if (!trimmed) return resolveOrigin() + '/monaco';
                if (/^https?:\\/\\//i.test(trimmed)) return trimmed.replace(/\\/+$/, '');
                if (trimmed.startsWith('//')) {
                  return (window.location ? window.location.protocol : 'https:') + trimmed;
                }
                if (trimmed.startsWith('/')) {
                  return resolveOrigin() + trimmed;
                }
                return trimmed;
              }
              function createWorkerBlob(rootBase, vsBase, label) {
                if (typeof URL === 'function' && typeof Blob === 'function') {
                  var cleanRoot = (rootBase || '').replace(/\/$/, '');
                  var cleanVs = (vsBase || '').replace(/\/$/, '');
                  var workerEntry = cleanVs + '/base/worker/workerMain.js';
                  var source = [
                    "self.MonacoEnvironment = self.MonacoEnvironment || {};",
                    "self.MonacoEnvironment.baseUrl = " + JSON.stringify(cleanRoot) + ";",
                    "self.MONACO_WORKER_LABEL = " + JSON.stringify(label || '') + ";",
                    "importScripts(" + JSON.stringify(workerEntry) + ");",
                  ].join('\\n');
                  try {
                    var blob = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
                    console.info('[monaco] created worker blob', { label: label, url: blob });
                    return blob;
                  } catch (err) {
                    console.error('[monaco] failed to create worker blob', err);
                  }
                } else {
                  console.warn('[monaco] Blob/URL API not available; fallback worker URL will be used');
                }
                return null;
              }

              function assignEnvironment() {
                if (typeof window === 'undefined') return;
                var normalizedRoot = normaliseBase(baseRoot);
                var normalizedVs = normalizedRoot.replace(/\/$/, '') + '/vs';
                window.__MONACO_BASE_URL__ = normalizedRoot;
                var env = window.MonacoEnvironment || {};
                env.baseUrl = normalizedRoot;
                env.getWorkerUrl = function (moduleId, label) {
                  var blobUrl = createWorkerBlob(normalizedRoot, normalizedVs, label || '');
                  if (blobUrl) return blobUrl;
                  var fallback = normalizedVs + '/base/worker/workerMain.js';
                  console.warn('[monaco] using fallback worker url', fallback);
                  return fallback;
                };
                window.MonacoEnvironment = env;
                try {
                  var sampleUrl = env.getWorkerUrl(null, 'json');
                  console.info('[monaco] env assigned', { baseUrl: normalizedRoot, sampleWorker: sampleUrl });
                } catch (envErr) {
                  console.error('[monaco] failed to sample worker url', envErr);
                }
                try {
                  fetch(normalizedVs + '/base/worker/workerMain.js', { method: 'HEAD' })
                    .then(function (res) {
                      console.info('[monaco] workerMain HEAD', res.status, res.statusText);
                    })
                    .catch(function (err) {
                      console.error('[monaco] workerMain HEAD failed', err);
                    });
                } catch (headErr) {
                  console.error('[monaco] workerMain HEAD threw', headErr);
                }
                try {
                  var cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
                  if (cspMeta) {
                    console.info('[monaco] meta CSP', cspMeta.content || '');
                  } else {
                    console.info('[monaco] meta CSP not found');
                  }
                } catch (cspErr) {
                  console.error('[monaco] meta CSP inspection failed', cspErr);
                }
                window.__MONACO_ENV_READY__ = true;
              }
              assignEnvironment();
              window.__MONACO_ASSIGN_ENV__ = assignEnvironment;
            })();
          `}
        </Script>
        <Script src={`${MONACO_VS}/loader.js`} strategy="beforeInteractive" />
        <Script id="monaco-env" strategy="beforeInteractive">
          {`
            (function () {
              function setup() {
                if (typeof window === 'undefined') return;
                if (typeof window.__MONACO_ASSIGN_ENV__ === 'function') {
                  window.__MONACO_ASSIGN_ENV__();
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
                        window.require.config({ paths: { vs: ${MONACO_VS_SCRIPT_VALUE} } });
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
