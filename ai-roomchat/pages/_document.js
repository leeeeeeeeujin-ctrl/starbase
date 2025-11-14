import Document, { Html, Head, Main, NextScript } from 'next/document';

class MyDocument extends Document {
  render() {
    return (
      <Html lang="ko">
        <Head>
          {/* Define a global guard for legacy references to prevent ReferenceError */}
          <script
            dangerouslySetInnerHTML={{
              __html: `try{if(typeof extensionsOpen==='undefined'){var extensionsOpen=false;}}catch(e){}`,
            }}
          />
          {/* PWA / installability meta – align with ai-roomchat nested app */}
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <meta name="theme-color" content="#4fc3f7" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="apple-touch-icon" href="/icon.png" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
