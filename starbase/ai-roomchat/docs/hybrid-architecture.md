# 하이브리드 게임 아키텍처

## 개요
게임 로직의 일부를 클라이언트(모바일 앱)에서 실행하고, 서버는 검증과 동기화만 담당하는 구조.

## 아키텍처 다이어그램

```
┌──────────────────────────────────────────────────────────────┐
│                      모바일 앱 (Client)                       │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌────────────────────┐      ┌─────────────────────┐         │
│  │ Matching Engine    │      │ Game State Manager  │         │
│  │ (클라이언트 계산)   │      │ (턴 진행 로직)       │         │
│  └────────────────────┘      └─────────────────────┘         │
│           │                            │                      │
│           ├────────────────────────────┤                      │
│           │                            │                      │
│  ┌────────▼────────────────────────────▼────────┐            │
│  │         Local Storage (SQLite)               │            │
│  │   - 게임 상태 캐싱                            │            │
│  │   - 오프라인 플레이                           │            │
│  │   - 히어로 데이터                             │            │
│  └────────┬─────────────────────────────────────┘            │
│           │                                                   │
└───────────┼───────────────────────────────────────────────────┘
            │
            │ (동기화 요청)
            │
┌───────────▼───────────────────────────────────────────────────┐
│                     서버 / 웹 (Server)                         │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌────────────────────┐      ┌─────────────────────┐         │
│  │ Verification API   │      │ OpenAI API Proxy    │         │
│  │ (결과 검증)         │      │ (AI 호출)            │         │
│  └────────────────────┘      └─────────────────────┘         │
│           │                            │                      │
│  ┌────────▼────────────────────────────▼────────┐            │
│  │         Supabase Database                    │            │
│  │   - 최종 게임 결과 저장                       │            │
│  │   - 리더보드 / 통계                           │            │
│  │   - Realtime 멀티플레이어                     │            │
│  └──────────────────────────────────────────────┘            │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

## 클라이언트 실행 로직

### 1. 매칭 계산 (`lib/rank/matching.js`)
- **현재 위치**: 서버 `/api/rank/match`
- **이관 후**: 모바일 앱에서 직접 실행
- **이점**:
  - 네트워크 왕복 제거 (200-500ms 절약)
  - 서버 CPU 사용량 90% 감소
  - 오프라인 매칭 시뮬레이션 가능

```javascript
// 클라이언트 실행
import { matchRankParticipants } from '@/lib/rank/matching'

const result = matchRankParticipants({ roles, queue, scoreWindows })
// → 로컬 기기 CPU 사용 (~10-50ms)
```

### 2. 게임 상태 관리 (`useStartClientEngine`)
- **현재**: 이미 클라이언트 실행 중 ✅
- **강화**: Capacitor Storage API로 오프라인 지원

```javascript
import { Preferences } from '@capacitor/preferences'

// 게임 상태 로컬 저장
await Preferences.set({
  key: 'game_state',
  value: JSON.stringify(gameState)
})
```

### 3. 턴 진행 로직
- **현재**: 클라이언트에서 UI 업데이트
- **강화**: AI 호출만 서버로 전송

```javascript
// 클라이언트: 턴 진행 UI
function advanceTurn() {
  // 로컬 계산
  const nextState = calculateNextTurnState(currentState)
  
  // AI 필요 시만 서버 호출
  if (needsAIResponse(nextState)) {
    const response = await fetch('/api/rank/play', {
      method: 'POST',
      body: JSON.stringify({ heroIds, gameId })
    })
  }
  
  updateLocalState(nextState)
}
```

## 서버 역할 (검증 + 동기화)

### 1. 매칭 결과 검증 (`/api/rank/match/verify`)
```javascript
POST /api/rank/match/verify
{
  "gameId": "...",
  "clientResult": {
    "ready": true,
    "assignments": [...],
    "metadata": { "executionTime": 45 }
  }
}

→ 서버에서 독립 재계산 후 비교
→ 일치 시: 승인
→ 불일치 시: 거부 (치트 방지)
```

### 2. OpenAI API 프록시
- **이유**: API 키 보안 (클라이언트에 노출 불가)
- **비용**: 게임당 $0.01~0.05

### 3. Supabase 동기화
- **멀티플레이어**: Realtime subscriptions
- **리더보드**: 최종 결과만 서버에 저장

## 비용 절감 효과

### Before (서버 중심)
```
매칭 요청 1,000회/일
- 서버 CPU: 100% 사용
- 네트워크: 왕복 200-500ms
- 비용: EC2 t3.medium ($30/월)
```

### After (하이브리드)
```
매칭 요청 1,000회/일
- 서버 CPU: 10% 사용 (검증만)
- 네트워크: 단방향 50-100ms
- 비용: EC2 t3.micro ($8/월)

절감: $22/월 (73% 감소)
```

## 구현 단계

### Phase 1: 매칭 하이브리드화 ✅
- [x] `hybridMatchingEngine.js` 생성
- [x] `/api/rank/match/verify` 엔드포인트
- [ ] 기존 `/api/rank/match`에 하이브리드 모드 통합

### Phase 2: 오프라인 지원
- [ ] Capacitor Preferences 통합
- [ ] SQLite 로컬 캐싱
- [ ] 온라인 복귀 시 자동 동기화

### Phase 3: 모바일 최적화
- [ ] 네이티브 푸시 알림 (게임 시작)
- [ ] 백그라운드 동기화
- [ ] 배터리 최적화

## 사용 예시

```javascript
// 클라이언트 코드 (React Native / Capacitor)
import { runHybridMatching } from '@/lib/rank/hybridMatchingEngine'

const result = await runHybridMatching({
  gameId: '123',
  mode: 'rank_solo',
  roles: [...],
  queue: [...],
  scoreWindows: [100, 200],
  host: null,
})

if (result.verified && result.ready) {
  // 게임 시작!
  navigateToGameRoom(result.assignments)
}
```

## 기술 스택

| 영역 | 기술 | 역할 |
|------|------|------|
| 모바일 앱 | Capacitor | 네이티브 래퍼 |
| 로컬 스토리지 | Capacitor Preferences | 게임 상태 캐싱 |
| 로컬 DB | Capacitor SQLite | 오프라인 데이터 |
| 매칭 엔진 | `lib/rank/matching.js` | 클라이언트 실행 |
| 서버 검증 | Next.js API | 결과 검증 |
| 데이터베이스 | Supabase | 최종 저장 |
| AI | OpenAI API | 게임 프롬프트 |

## 보안 고려사항

1. **클라이언트 코드 난독화**: 매칭 로직을 역공학하기 어렵게
2. **서버 검증 필수**: 모든 결과를 서버에서 재계산
3. **타임스탬프 체크**: 오래된 결과 거부
4. **API 키 숨김**: OpenAI 키는 서버에만 존재

## 참고 자료

- [Capacitor Documentation](https://capacitorjs.com/)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [React Native Performance](https://reactnative.dev/docs/performance)
