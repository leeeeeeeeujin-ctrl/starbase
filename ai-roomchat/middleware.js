import { NextResponse } from 'next/server';
import FEATURES, { getFeatureForRoute } from './config/features';

/**
 * Feature Flag Middleware
 *
 * 비활성화된 기능의 페이지/API로 접근 시 404 또는 적절한 응답 반환
 */
export function middleware(request) {
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
