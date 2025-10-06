export const HERO_BLOCKER_MESSAGE = '사용할 캐릭터를 선택해 주세요.'
export const ROLE_BLOCKER_MESSAGE = '참가할 역할 정보를 불러오고 있습니다.'
export const VIEWER_BLOCKER_MESSAGE = '로그인 상태를 확인하는 중입니다.'

export const HERO_REDIRECT_DELAY_MS = 3000
export const MATCH_TRANSITION_DELAY_MS = 3000
export const QUEUE_TIMEOUT_MS = 60000
export const MATCH_INACTIVITY_TIMEOUT_MS = 45000
export const CONFIRMATION_WINDOW_SECONDS = 15
export const FAILURE_REDIRECT_DELAY_MS = 2400
export const PENALTY_NOTICE =
  '15초 안에 게임 참여를 확정하지 않아 매칭에서 제외되었어요. 다른 참가자들은 다시 매칭을 진행합니다.'
export const MATCH_REQUEUE_NOTICE =
  '다른 참가자가 게임 참여를 확정하지 않아 다시 매칭을 진행합니다.'

export {
  QUEUE_HEARTBEAT_INTERVAL_MS,
  QUEUE_STALE_THRESHOLD_MS,
} from '../../lib/rank/queueHeartbeat'
