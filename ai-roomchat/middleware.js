// Feature Flag Middleware (Edge-compatible)
export async function middleware(request) {
  const { NextResponse } = await import('next/server');
  try {
    const { pathname } = request.nextUrl;
    const mod = await import('./config/features');
    const FEATURES = mod.default;
    const getFeatureForRoute = mod.getFeatureForRoute;
    const feature = getFeatureForRoute(pathname);
    if (feature && !FEATURES[feature]) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'feature_disabled', feature }, { status: 404 });
      }
      return NextResponse.rewrite(new URL('/404', request.url));
    }
    return NextResponse.next();
  } catch (err) {
    const { NextResponse } = await import('next/server');
    return NextResponse.json({ error: 'internal_middleware_error' }, { status: 500 });
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};

