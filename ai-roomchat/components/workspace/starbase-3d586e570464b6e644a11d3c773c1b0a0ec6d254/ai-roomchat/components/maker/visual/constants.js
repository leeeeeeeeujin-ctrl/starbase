// Visual Node Editor constants
// 분리 목적: 대형 파일 분할 및 재사용성 향상

export const NODE_TYPES = {
  // 이벤트 노드
  EVENTS: {
    START: { label: '게임 시작', color: '#22c55e', icon: '🚀', category: 'events' },
    UPDATE: { label: '매 프레임', color: '#3b82f6', icon: '🔄', category: 'events' },
    CLICK: { label: '클릭 시', color: '#8b5cf6', icon: '👆', category: 'events' },
    COLLISION: { label: '충돌 시', color: '#ef4444', icon: '💥', category: 'events' },
    KEY_PRESS: { label: '키 입력', color: '#f59e0b', icon: '⌨️', category: 'events' },
    TIMER: { label: '타이머', color: '#06b6d4', icon: '⏰', category: 'events' },
  },

  // 액션 노드
  ACTIONS: {
    MOVE: { label: '이동하기', color: '#10b981', icon: '🏃', category: 'actions' },
    ROTATE: { label: '회전하기', color: '#f97316', icon: '🔄', category: 'actions' },
    SCALE: { label: '크기 변경', color: '#8b5cf6', icon: '📏', category: 'actions' },
    PLAY_SOUND: { label: '소리 재생', color: '#ec4899', icon: '🔊', category: 'actions' },
    SHOW_TEXT: { label: '텍스트 표시', color: '#3b82f6', icon: '💬', category: 'actions' },
    CHANGE_SCENE: { label: '장면 변경', color: '#ef4444', icon: '🎬', category: 'actions' },
    SPAWN_OBJECT: { label: '오브젝트 생성', color: '#22c55e', icon: '✨', category: 'actions' },
    DESTROY: { label: '파괴하기', color: '#dc2626', icon: '💥', category: 'actions' },
  },

  // 조건 노드
  CONDITIONS: {
    IF: { label: '만약', color: '#f59e0b', icon: '❓', category: 'conditions' },
    COMPARE: { label: '비교', color: '#06b6d4', icon: '⚖️', category: 'conditions' },
    AND: { label: '그리고', color: '#8b5cf6', icon: '&', category: 'conditions' },
    OR: { label: '또는', color: '#ec4899', icon: '|', category: 'conditions' },
    NOT: { label: '아니면', color: '#ef4444', icon: '!', category: 'conditions' },
  },

  // 변수 노드
  VARIABLES: {
    SET: { label: '변수 설정', color: '#f97316', icon: '📦', category: 'variables' },
    GET: { label: '변수 가져오기', color: '#10b981', icon: '📤', category: 'variables' },
    CHANGE: { label: '변수 변경', color: '#3b82f6', icon: '📊', category: 'variables' },
    RANDOM: { label: '랜덤 숫자', color: '#8b5cf6', icon: '🎲', category: 'variables' },
  },

  // 게임 특화 노드
  GAME: {
    PLAYER: { label: '플레이어', color: '#22c55e', icon: '👤', category: 'game' },
    ENEMY: { label: '적', color: '#ef4444', icon: '👹', category: 'game' },
    ITEM: { label: '아이템', color: '#f59e0b', icon: '💎', category: 'game' },
    SCORE: { label: '점수', color: '#3b82f6', icon: '🏆', category: 'game' },
    HEALTH: { label: '체력', color: '#dc2626', icon: '❤️', category: 'game' },
    LEVEL: { label: '레벨', color: '#8b5cf6', icon: '🎯', category: 'game' },
  },
};

export const NODE_CATEGORIES = [
  { id: 'events', label: '이벤트', icon: '⚡', color: '#22c55e' },
  { id: 'actions', label: '액션', icon: '🎬', color: '#3b82f6' },
  { id: 'conditions', label: '조건', icon: '🤔', color: '#f59e0b' },
  { id: 'variables', label: '변수', icon: '📊', color: '#8b5cf6' },
  { id: 'game', label: '게임', icon: '🎮', color: '#ec4899' },
];
