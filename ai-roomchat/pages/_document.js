import { Html, Head, Main, NextScript } from 'next/document';
import Script from 'next/script';

export default function Document() {
  return (
    <Html lang="ko">
      <Head>
        <meta name="mobile-web-app-capable" content="yes" />
        <Script id="monaco-env" strategy="beforeInteractive">
          {`
            (function () {
              var base = '/monaco/vs';
              window.__MONACO_BASE_URL__ = base;
              window.MonacoEnvironment = {
                baseUrl: base,
                getWorkerUrl: function (moduleId, label) {
                  if (label === 'json') {
                    return base + '/language/json/json.worker.js';
                  }
                  if (label === 'css' || label === 'scss' || label === 'less') {
                    return base + '/language/css/css.worker.js';
                  }
                  if (label === 'html' || label === 'handlebars' || label === 'razor') {
                    return base + '/language/html/html.worker.js';
                  }
                  if (label === 'typescript' || label === 'javascript') {
                    return base + '/language/typescript/ts.worker.js';
                  }
                  return base + '/editor/editor.worker.js';
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
