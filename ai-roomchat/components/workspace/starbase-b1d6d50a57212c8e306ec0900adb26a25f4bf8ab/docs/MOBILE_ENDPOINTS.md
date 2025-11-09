# Mobile Endpoints Setup (Capacitor / PWA)

이 문서는 모바일 빌드에서 사용할 기본 서버 호스트(primaryHost)를 `public/mobile-endpoints.json`에 내장하는 방법과 관련 환경 변수 설정을 정리합니다.

## 요약
- 모바일 앱(또는 모바일용 번들)을 배포할 때, 앱이 연결할 기본 서버 호스트를 결정해 `public/mobile-endpoints.json`에 기록합니다.
- 빌드 스크립트 `ai-roomchat/scripts/gen-mobile-endpoints.js`가 실행되어 위 파일을 생성합니다.
- 다음 환경 변수 중 가장 먼저 발견되는 값을 사용합니다(앞일수록 우선순위 높음):
  1. `MOBILE_SERVER_URL`
  2. `NEXT_PUBLIC_MOBILE_SERVER_URL`
  3. `APP_BASE_URL`
  4. `VERCEL_PROJECT_PRODUCTION_URL`
  5. `VERCEL_URL`
  6. (최후의 수단) `NEXT_PUBLIC_SUPABASE_URL`

값은 `https://example.com` 형태의 절대 URL이어야 하며, 끝의 슬래시는 제거됩니다.

## 필수 단계
1. 환경 변수 설정 (예시)
   - PowerShell (Windows):
     ```powershell
     $env:MOBILE_SERVER_URL = "https://your-prod-host.example"
     ```
   - bash (macOS/Linux):
     ```bash
     export MOBILE_SERVER_URL=https://your-prod-host.example
     ```

2. 모바일 빌드 실행
   - 워크스페이스 루트 기준:
     ```powershell
     cd ai-roomchat
     npm run mobile:build
     ```
   - 위 스크립트는 다음을 수행합니다:
     - `node scripts/gen-mobile-endpoints.js`
     - `next build`
     - `npx cap copy`

3. 생성 결과 확인
   - `ai-roomchat/public/mobile-endpoints.json`의 `primaryHost`가 기대한 호스트로 설정되었는지 확인합니다.
   - 런타임에서 `/debug/mobile-endpoints` 페이지로도 확인 가능합니다.

## 런타임 오버라이드(디버그)
- 설치 없이 임시로 호스트를 바꾸고 싶다면 브라우저 `localStorage`에 `MOBILE_SERVER_OVERRIDE` 키를 설정하거나, `/debug/mobile-endpoints` 페이지에서 설정할 수 있습니다.
- 이 값은 로컬 디버깅 용도이며, 배포 빌드에서는 위에 설명한 환경 변수 기반의 `primaryHost`가 권장됩니다.

## 트러블슈팅
- `primaryHost`가 `null`로 표시되면 빌드 당시 위 환경 변수들이 설정되지 않은 것입니다. 적절한 값을 설정한 뒤 다시 `npm run mobile:build`를 실행하세요.
- Vercel 환경에서 자동으로 `VERCEL_URL`/`VERCEL_PROJECT_PRODUCTION_URL`이 주어질 수 있습니다. 외부 도메인(커스텀 도메인)을 원하는 경우 `MOBILE_SERVER_URL`로 명시하는 것을 권장합니다.

## 참고 링크
- 디버그 페이지: `/debug/mobile-endpoints`
- 건강 체크: `/api/health`
- 관리자 오프로딩 통계: `/admin/offload`