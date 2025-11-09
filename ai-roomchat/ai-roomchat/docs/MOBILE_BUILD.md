# 모바일 빌드 & 설치 가이드 (Android / iOS)

실환경(프로덕션 서버) 기준으로 Capacitor 래퍼를 통해 앱을 패키징하는 최소 절차입니다.

## 1. 의존성 설치
```bash
npm install
```
(이미 설치되어 있으면 생략)

## 2. 정적 빌드 (Next.js `output: export` 사용)
```bash
npm run build
```
빌드 후 `out/` 디렉터리가 생성됩니다.

> 참고: SSR/API 라우트는 정적 export에 포함되지 않습니다. 이 앱은 주요 뷰가 클라이언트 실행/원격 API 호출 패턴이라 export로 문제 최소화. 만약 SSR이 필요한 특정 페이지가 있다면 Capacitor에서 프로덕션 도메인을 `server.url`로 지정하는 하이브리드 모드로 전환하세요.

## 3. 플랫폼 추가 (1회)
```bash
npx cap add android
npx cap add ios
```
생성 후 `android/`, `ios/` 폴더가 생깁니다.

## 4. 웹 자산 복사 & 동기화
```bash
npm run mobile:build   # next build + next export + cap copy
npx cap sync           # (선택) plugin/구성 재동기화
```

## 5. Android 디바이스/에뮬레이터 실행
```bash
npm run mobile:android
```
Android Studio 열기 → Run ▶

APK 직접 설치:
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

릴리즈 서명 & 빌드 (요약):
1. Android Studio: Build > Generate Signed APK (또는 App Bundle)
2. Keystore 생성 / 비밀번호 입력
3. Release APK/App Bundle 추출 → 스토어 업로드

## 6. iOS 디바이스 실행
```bash
npm run mobile:ios
```
Xcode 열기 → Signing & Capabilities에서 Team 선택 → 디바이스 연결 후 Run.

아카이브 & 배포:
1. Product > Archive
2. Archives 창에서 Distribute App
3. App Store Connect 업로드 → TestFlight → 심사 후 릴리즈

## 7. 서버 연동(실환경 도메인 사용) 옵션
현재 `capacitor.config.ts`는 정적 자산만 사용합니다. SSR/API를 앱 내부가 아닌 원격 서버로 직접 호출하고 싶다면:
```ts
// capacitor.config.ts 내부 수정 예시
server: { url: 'https://prod.your-domain.com', cleartext: false }
```
이렇게 하면 HMR 없이도 최신 서버 UI/라우트를 그대로 표시합니다.

## 8. 플러그인 추가 예시 (카메라)
```bash
npm install @capacitor/camera
npx cap sync
```
사용:
```ts
import { Camera, CameraResultType } from '@capacitor/camera';
const photo = await Camera.getPhoto({ resultType: CameraResultType.Uri });
```

## 9. 권한/보안 체크리스트
| 항목 | Android | iOS |
|------|---------|-----|
| 인터넷 | AndroidManifest 자동 포함 | Info.plist ATS (기본 허용) |
| 카메라 | 권한 선언 필요 | Privacy - Camera Usage Description |
| 파일 저장 | WRITE/READ 권한(Scoped) | iCloud/파일 접근 추가 가능 |
| 푸시 | FCM 설정 | APNs 인증서/키 |

## 10. 문제 해결
| 증상 | 원인 | 해결 |
|------|------|------|
| SW 동작 안 함 | file:// 환경 | 서버 URL 사용 또는 PWA 별도 배포 |
| API 404 | export 시 빌드 제외된 동적 라우트 | server.url 사용(원격) 또는 별도 프록시 페이지 구성 |
| WebView 캐시 갱신 지연 | 오래된 out/ 사용 | `npm run mobile:build` 후 `npx cap sync` 재실행 |

## 11. 릴리즈 전 점검
- 앱 아이콘/스플래시를 네이티브 프로젝트에서 교체 (Android `mipmap-*`, iOS Asset Catalog)
- 버전/빌드번호 증가 (Android: Gradle, iOS: General 탭)
- 최소 지원 OS 설정 (Gradle, Xcode Deployment Target)

## 12. 다음 개선 방향
- 서버 URL 모드 + 기능 플래그로 일부 페이지 SSR 유지
- 오프라인 우선 캐시 지표 수집 (성공률, 복구 시간)
- Crash/에러 수집 Sentry 네이티브 SDK 통합 (현재 웹만)

---
필요하면 이 파일에 특정 스토어 제출 체크리스트(콘솔 스크린샷, 개인정보 처리방침 링크 등)도 추가해 드릴 수 있습니다.
