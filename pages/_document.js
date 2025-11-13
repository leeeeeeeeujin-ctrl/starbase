import Document, { Html, Head, Main, NextScript } from 'next/document';

class MyDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          <script
            dangerouslySetInnerHTML={{
              __html: `try{if(typeof globalThis!=='undefined'){if(typeof globalThis.__EXT_OPEN__==='undefined'){globalThis.__EXT_OPEN__=false;}if(typeof globalThis.extensionsOpen==='undefined'){globalThis.extensionsOpen=globalThis.__EXT_OPEN__}}}catch(e){}`,
            }}
          />
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

