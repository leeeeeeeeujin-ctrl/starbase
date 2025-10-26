import { NextResponse } from 'next/server';
import FEATURES, { getFeatureForRoute } from './config/features';

/**
 * Feature Flag Middleware
 *
 * 비활성화된 기능의 페이지/API로 접근 시 404 또는 적절한 응답 반환
 */
export function middleware(request) {
  try {
    const { pathname } = request.nextUrl;

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
