/**
 * Feature Flags Configuration
 *
 * 각 기능을 활성화/비활성화할 수 있습니다.
 * 환경변수로 오버라이드 가능: FEATURE_RANK=false npm run dev
 */

const FEATURES = {
  // 🎮 Rank Game System
  rank: process.env.FEATURE_RANK !== 'false',

  // 🛠️ Prompt Maker
  maker: process.env.FEATURE_MAKER !== 'false',

  // 👑 Admin Portal
  admin: process.env.FEATURE_ADMIN !== 'false',

  // ⚔️ Arena
  arena: process.env.FEATURE_ARENA !== 'false',

  // 💬 Chat & Messaging
  chat: process.env.FEATURE_CHAT !== 'false',

  // 🎭 Character System
  character: process.env.FEATURE_CHARACTER !== 'false',

  // 📊 Analytics & Monitoring
  analytics: process.env.FEATURE_ANALYTICS !== 'false',
};

/**
 * 기능이 활성화되어 있는지 확인
 */
export function isFeatureEnabled(featureName) {
  return FEATURES[featureName] === true;
}

/**
 * 활성화된 모든 기능 목록
 */
export function getEnabledFeatures() {
  return Object.entries(FEATURES)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
}

/**
 * 기능별 라우트 prefix
 */
export const FEATURE_ROUTES = {
  rank: ['/rank', '/api/rank', '/play', '/lobby', '/roster'],
  maker: ['/maker', '/api/maker'],
  admin: ['/admin', '/api/admin'],
  arena: ['/arena', '/api/arena'],
  chat: ['/chat', '/api/chat', '/api/messages'],
  character: ['/character', '/api/character'],
};

/**
 * 특정 경로가 어느 기능에 속하는지 확인
 */
export function getFeatureForRoute(pathname) {
  for (const [feature, routes] of Object.entries(FEATURE_ROUTES)) {
    if (routes.some(route => pathname.startsWith(route))) {
      return feature;
    }
  }
  return null;
}

export default FEATURES;
