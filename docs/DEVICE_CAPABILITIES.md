# Device Capability Matrix & Bridging Strategy

웹(PWA)과 네이티브(Android/iOS, Capacitor/TWA) 환경별 기능 지원/폴백/브리징 전략을 정리합니다. 디버그 페이지(`/debug/capabilities`)에서 감지된 항목과 아래 표를 매핑하여 클라이언트 오프로딩 판단에 활용합니다.

## 1. Capability Matrix

| 기능 | PWA (Chrome/Edge/Android) | PWA (iOS Safari) | Native (Android Capacitor) | Native (iOS Capacitor) | 폴백/브리징 |
|------|--------------------------|------------------|----------------------------|-----------------------|-------------|
| WebGPU | 최신(일부 기기) 지원 | 미지원 | 네이티브 GPU via plugin (추후) | Metal bridge 가능(추후) | WebGL로 다운그레이드 |
| WebCodecs | 지원 (Chrome) | 미지원 | 네이티브 미디어 API | 네이티브 미디어 API | WASM 디코더(ffmpeg-wasm) |
| WASM (Threads/SIMD) | 대부분 지원 | 일부 제한(Threads 미지원) | 네이티브 코드 | 네이티브 코드 | Single-thread WASM 경로 |
| FS (Origin Private File System) | 지원 | 제한적 | 디바이스 파일/플러그인 | 디바이스 파일/플러그인 | IndexedDB 캐시 |
| Offline Cache (SW) | 지원(Service Worker) | 지원(Service Worker) | 앱 자체 번들/스토리지 | 앱 자체 번들/스토리지 | 최소: memory cache |
| Push Notifications | 지원(권한 필요) | 제한/최근 개선 | FCM/APNS | APNS | In-app polling fallback |
| Background Sync | 지원(제한) | 미지원 | OS 백그라운드 작업 | OS 백그라운드 작업 | 재접속시 Flush 처리 |
| Clipboard Rich | 대부분 지원 | 제한 | 네이티브 클립보드 | 네이티브 클립보드 | 텍스트-only |
| Screen Wake Lock | 지원 | 제한 | 네이티브 API | 네이티브 API | 주기적 사용자 인터랙션 유도 |
| Audio Worklet | 지원 | 일부 제한 | 네이티브 오디오 엔진 | 네이티브 오디오 엔진 | 단순 HTMLAudioElement |

## 2. Detection & Context Layer

`ClientCapabilitiesContext` 에서 다음 키를 수집:
- `hasWebGPU`
- `hasWebCodecs`
- `hasWasmSIMD`
- `hasFileSystemAccess`
- `hasServiceWorker`
- `hasPush` (권한 + API)
- `hasBackgroundSync`
- `hasAudioWorklet`
- `displayMode` (standalone vs browser)

디버그 페이지 `/debug/capabilities` 에서 위 항목을 직렬화하여 시각화.

## 3. Offload Decision Heuristics (예시)

| 작업 | 선호 경로 | 조건 | 폴백 |
|------|----------|------|------|
| 룰 시뮬레이션 | iframe Sandbox | 자원 예산 OK | Web Worker → inline JS |
| 이미지 압축(WebP) | WebCodecs | `hasWebCodecs=true` | WASM 기반 sharp/ffmpeg-wasm → 서버 업로드 압축 |
| 오디오 특징 추출 | WASM (SIMD) | `hasWasmSIMD=true` | 일반 WASM → 서버 추출 |
| 비디오/미디어 디코딩 | WebCodecs | 지원 | WASM ffmpeg 디코더 또는 서버 프리프로세스 |
| 대규모 그래픽 처리 | WebGPU | `hasWebGPU=true` | WebGL / Canvas2D / 서버 프레임 프리렌더 |
| 대용량 데이터 캐시 | OPFS | `hasFileSystemAccess=true` | IndexedDB → memory cache |
| 백그라운드 큐 Flush | Background Sync | `hasBackgroundSync=true` | 포그라운드 재접속 시 batch 처리 |

## 4. Bridging Strategy (Native 전환)

1. PWA 설치 후 사용자 행동/세션 데이터 로컬 캐시(JSON/IndexedDB)
2. 네이티브 앱 실행 시 커스텀 스킴으로 PWA 캐시 dump (추후 브리지)
3. 고성능 연산(WebGPU 필요 등)은 네이티브 플러그인(예정)으로 이관, PWA는 'Light Mode' 태그 부여
4. Metrics: 오프로딩 성공률(iframe/worker/inline) + skip 사유와 capability snapshot 함께 업로드

## 5. Fallback Patterns

| 패턴 | 설명 |
|------|------|
| Graceful Downgrade | 고급 API 없으면 단순/저성능 구현으로 자동 전환 |
| Server Verification | 로컬 연산 결과를 부분 샘플링(예: 20%) 서버 검증 |
| Batching & Flush | 백그라운드 미지원 시 포그라운드 재진입 시 한번에 전송 |
| Partial Suspend | GPU/코덱 부재 시 해당 기능 UI를 숨기고 안내 배너 출력 |

## 6. Testing Considerations
- Jest: capability mock 객체로 분기 테스트
- Playwright: `display-mode` 시뮬레이션(헤드리스 설치 모드 vs 브라우저)
- Budget 가드: 번들 증가 시 WebGPU-only 코드 분리(조건부 dynamic import)

## 7. 다음 확장 포인트
- 네이티브 플러그인 WebGPU 브리지 프로토타입
- Media pipeline: WebCodecs → WASM 디코더 성능 비교 자동 측정
- Push/Offline 재시도 지수백오프 + 사용자 알림 정책 문서화

## 8. 빠른 체크리스트 (구현자용)
1. 기능 추가 시 `ClientCapabilitiesContext`에 감지 로직 추가
2. 디버그 페이지에 새 키 반영
3. Offload 결정 함수에 조건 삽입 → skip 사유 기록
4. 테스트(유닛 + 성능 quick-check) 업데이트
5. 관리자 업로드 시 capability snapshot 포함 검토

---
최종 갱신 시각: {{UPDATED_AT}}
