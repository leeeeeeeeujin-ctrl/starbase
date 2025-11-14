// Central, idempotent Monaco loader initialisation for the ai-roomchat apps.
//
// 과거 버전에서는 초기화 순서가 꼬이면서
// "Monaco loader not initialized" 같은 에러가 올라오곤 했습니다.
// 이 파일은 그런 예외를 절대 던지지 않고,
// 가능한 한 조용하게(콘솔 로그만 남기고) 초기화만 담당하도록 단순화했습니다.

import loader from '@monaco-editor/loader';

let hasConfigured = false;
let hasStartedInit = false;

export function ensureMonaco() {
  if (typeof window === 'undefined') return;

  // 한 번만 설정하면 충분합니다.
  if (!hasConfigured) {
    loader.config({
      paths: {
        // 루트/중첩 앱에서 모두 재사용 가능한 CDN 경로
        vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs',
      },
    });
    hasConfigured = true;
  }

  if (hasStartedInit) return;
  hasStartedInit = true;

  loader
    .init()
    .catch((err) => {
      // 여기서 예외를 다시 던지지 않습니다.
      // 에디터 쪽에서는 필요하면 자체 폴백(텍스트 영역 등)으로 처리합니다.
      // eslint-disable-next-line no-console
      console.error('[monaco] ensureMonaco failed', err);
      hasStartedInit = false;
    });
}

