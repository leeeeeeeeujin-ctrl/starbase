// Dynamically import NextResponse at runtime inside the middleware function
// to avoid pulling `next/server` and its vendor dependencies into module
// evaluation time. Some bundled vendor modules set a bundler base using
// `__dirname` which throws in Edge (no __dirname). Dynamic import allows
// us to catch and handle import-time errors inside the middleware function.

// Note: switch to a dynamic import for feature config so any module-evaluation
// errors (e.g. references to Node-only globals like __dirname) can be
// caught at runtime and logged. Static imports fail during module
// evaluation and are not catchable by the middleware function's try/catch.

/**
 * Feature Flag Middleware
 *
 * 비활성화된 기능의 페이지/API로 접근 시 404 또는 적절한 응답 반환
 */
export async function middleware(request) {
  // Lazy-load NextResponse so top-level module evaluation doesn't include
  // server-only vendor code that may reference Node globals like __dirname.
  let NextResponse;
  try {
    ({ NextResponse } = await import('next/server'));
  } catch (e) {
    // If dynamic import fails (very unlikely), provide a minimal fallback
    // that uses the standard Response API so we can still return JSON
    // diagnostic responses. This fallback is intentionally small — the
    // normal NextResponse behaviors (rewrite/next) should be available
    // from the real import in typical environments.
    NextResponse = {
      json: (obj, opts = {}) => {
        const body = JSON.stringify(obj);
        const headers = new Headers({ 'content-type': 'application/json' });
        const status = (opts && opts.status) || 200;
        return new Response(body, { status, headers });
      },
      rewrite: url => new Response(null, { status: 307, headers: { location: String(url) } }),
      next: () => undefined,
    };
  }
  // We make the middleware async and dynamically import the features module
  // so that if that module (or any of its transitive dependencies) throws
  // during evaluation (for example by referencing `__dirname`), we can
  // catch and log the stack trace and return a safe 500 response.
  try {
    const { pathname } = request.nextUrl;

    // Temporary diagnostics: log a precomputed list of suspicious files that
    // reference Node-only APIs (this JSON is generated at repo-level and
    // bundled into the middleware so Edge logs will contain it). Safe: no
    // secrets are written here. This is ephemeral and will be reverted after
    // we collect Vercel logs.
    try {
      const diag = await import('./tmp_diagnostics/suspicious_files.json');
      const suspicious = diag && (diag.default || diag);
      if (Array.isArray(suspicious) && suspicious.length) {
        try {
          console.warn('[middleware diag] suspicious_files_count=', suspicious.length);
          // Log up to 50 entries to avoid huge logs
          console.warn('[middleware diag] suspicious_files=', suspicious.slice(0, 50));
        } catch (e) {
          // ignore logging issues
        }
      }
    } catch (e) {
      try {
        console.warn('[middleware diag] no suspicious list available:', e && e.message);
      } catch (ignore) {}
    }

    // Dynamic import so import-time errors are catchable here
    let FEATURES;
    let getFeatureForRoute;
    try {
      const mod = await import('./config/features');
      FEATURES = mod.default;
      getFeatureForRoute = mod.getFeatureForRoute;
    } catch (importErr) {
      // Log the full stack to Vercel logs for diagnosis
      try {
        console.error(
          '[middleware] failed to import ./config/features:',
          importErr && importErr.message
        );
        if (importErr && importErr.stack) console.error(importErr.stack);
        // If debug requested (env or request header), return diagnostic payload
        const debugActive =
          process.env.DEBUG_MIDDLEWARE === '1' || request.headers.get('x-debug-middleware') === '1';
        if (debugActive) {
          const props = Object.getOwnPropertyNames(importErr).reduce((acc, k) => {
            try {
              acc[k] = String(importErr[k]).slice(0, 200);
            } catch (e) {
              acc[k] = '<unserializable>';
            }
            return acc;
          }, {});
          const diagResp = {
            error: 'middleware_import_failed',
            message: importErr && importErr.message,
            props,
          };
          const res = NextResponse.json(diagResp, { status: 500 });
          res.headers.set('X-MW-DIAG', 'import_failed');
          return res;
        }
      } catch (logErr) {
        // ignore logging errors
      }

      return NextResponse.json(
        { error: 'internal_middleware_error', message: 'Middleware initialization failed' },
        { status: 500 }
      );
    }

    // Feature check
    const feature = getFeatureForRoute(pathname);

    if (feature && !FEATURES[feature]) {
      // API 요청은 404 JSON
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          {
            error: 'feature_disabled',
            message: `Feature "${feature}" is not enabled on this installation`,
            feature,
          },
          { status: 404 }
        );
      }

      // 페이지 요청은 404 페이지로
      return NextResponse.rewrite(new URL('/404', request.url));
    }

    return NextResponse.next();
  } catch (err) {
    // 로그에 스택과 메시지를 남겨 Vercel 로그에서 원인 진단에 도움을 줍니다.
    // (보안상 민감값은 포함하지 않도록 주의)
    try {
      console.error('[middleware] caught error during request processing:', err && err.message);
      if (err && err.stack) console.error(err.stack);
      // If debug requested (env or request header), expose a trimmed diagnostic object
      const debugActive =
        process.env.DEBUG_MIDDLEWARE === '1' || request.headers.get('x-debug-middleware') === '1';
      if (debugActive) {
        const props = Object.getOwnPropertyNames(err).reduce((acc, k) => {
          try {
            acc[k] = String(err[k]).slice(0, 200);
          } catch (e) {
            acc[k] = '<unserializable>';
          }
          return acc;
        }, {});
        const diag = { message: err && err.message, props };
        const res = NextResponse.json(
          { error: 'internal_middleware_error', diagnostic: diag },
          { status: 500 }
        );
        res.headers.set('X-MW-DIAG', 'internal_error');
        return res;
      }
    } catch (logErr) {
      // ignore logging errors
    }

    // 내부 서버 오류 응답을 반환합니다. 상세한 내부 오류는 로그에서 확인하세요.
    return NextResponse.json(
      { error: 'internal_middleware_error', message: 'Internal middleware error' },
      { status: 500 }
    );
  }
}

/**
 * 미들웨어를 적용할 경로 패턴
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
