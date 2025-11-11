import { Html, Head, Main, NextScript } from 'next/document';
import Script from 'next/script';

const DEFAULT_MONACO_BASE = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs';
const rawBase = process.env.NEXT_PUBLIC_MONACO_BASE_URL?.trim();
const MONACO_BASE = rawBase && rawBase.length > 0 ? rawBase : DEFAULT_MONACO_BASE;
const MONACO_BASE_SCRIPT_VALUE = JSON.stringify(MONACO_BASE);

export default function Document() {
  return (
    <Html lang="ko">
      <Head>
        <meta name="mobile-web-app-capable" content="yes" />
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
              var base = normaliseBase(rawBase);
              window.__MONACO_BASE_URL__ = base;
              window.MonacoEnvironment = {
                baseUrl: base,
                getWorkerUrl: function (moduleId, label) {
                  var workerMap = {
                    json: 'language/json/jsonWorker.js',
                    css: 'language/css/cssWorker.js',
                    scss: 'language/css/cssWorker.js',
                    less: 'language/css/cssWorker.js',
                    html: 'language/html/htmlWorker.js',
                    handlebars: 'language/html/htmlWorker.js',
                    razor: 'language/html/htmlWorker.js',
                    typescript: 'language/typescript/tsWorker.js',
                    javascript: 'language/typescript/tsWorker.js',
                  };
                  var resolved =
                    (label && workerMap[label]) ||
                    (label === 'editorWorkerService' ? 'base/worker/workerMain.js' : null) ||
                    'base/worker/workerMain.js';
                  return joinPath(base, resolved);
                },
              };
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
