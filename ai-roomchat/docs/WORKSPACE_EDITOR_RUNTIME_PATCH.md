# AI Battle Judge Error Fallback 개선 (2025-12-12)

## 문제점

### 1. 폴백 메시지가 정상 AI 응답처럼 보임
- 에러 상황: `"플레이어이(가) 잠시 생각에 잠깁니다. 다음에는 어떤 일이 일어날까요?"`
- 사용자가 AI가 정상 작동한다고 착각

### 2. 캐릭터 이름 항상 "플레이어"
- `character?.name || '플레이어'` 단순 폴백
- 실제 게임 참가자 이름 반영 안됨

### 3. 에러와 성공 구분 불가
- `success` 필드 없음
- 클라이언트에서 폴백 감지 어려움

## 개선사항

### 1. 개발/프로덕션 모드 분리
```javascript
const isDev = process.env.NODE_ENV === 'development';
const fallbackNarrative = isDev
  ? `⚠️ AI 판정 실패: ${error.message}. 재시도하거나 API 키를 확인하세요.`
  : `${characterName}이(가) 잠시 생각에 잠깁니다. 다음에는 어떤 일이 일어날까요?`;
```

**개발 모드:**
- 명확한 에러 메시지
- `errorType`, `errorMessage` 필드 포함

**프로덕션:**
- 자연스러운 대기 메시지
- `success: false`, `fallback: true` 플래그로 구분

### 2. 캐릭터 이름 매핑 우선순위
```javascript
let characterName = '시스템';

if (routing?.participant?.name) {
  characterName = routing.participant.name;
} else if (gameState?.participants?.[0]) {
  const p = gameState.participants[0];
  characterName = p.name || p.hero?.name || p.heroName || characterName;
} else if (character?.name) {
  characterName = character.name;
}
```

**우선순위:**
1. `routing.participant.name` - API 라우팅 선택 참가자
2. `gameState.participants[].name` - 게임 상태 참가자
3. `character?.name` - 직접 전달 캐릭터
4. `'시스템'` - 최종 폴백

### 3. 응답 플래그 명확화
```javascript
// 성공 시
return {
  ...parsed,
  success: true,
  fallback: false,
  timestamp,
};

// 실패 시
return {
  narrative: fallbackNarrative,
  success: false,
  fallback: true,
  errorType: error.name,
  errorMessage: isDev ? error.message : undefined,
  timestamp,
};
```

## 폴백 발생 상황

1. **AI API 키 없음/잘못됨**
   - `Error('AI API 키가 설정되지 않았습니다')`

2. **네트워크 실패**
   - 타임아웃, 연결 오류

3. **레이트 리밋**
   - OpenAI API quota 초과

4. **내부 예외**
   - `callAIJudge` 실행 중 에러

## 클라이언트 처리 권장사항

### 폴백 감지
```javascript
if (response.fallback === true) {
  // 에러 상황 처리
  if (process.env.NODE_ENV === 'development') {
    showError(response.errorMessage);
    showRetryButton();
  } else {
    showMessage(response.narrative, { icon: '⚠️', style: 'warning' });
  }
}
```

### UI 힌트
- **개발**: 에러 아이콘 + 재시도 버튼 + 상세 에러
- **프로덕션**: 자연스러운 메시지 + 미묘한 경고 표시

## 이전 vs 개선 비교

| 항목 | 이전 | 개선 후 |
|------|------|---------|
| **에러 표시** | 자연스러운 문장만 | 개발: 명확한 에러<br>프로덕션: 플래그로 구분 |
| **캐릭터 이름** | 항상 "플레이어" | 참가자 정보에서 추출 |
| **성공/실패 구분** | 플래그 없음 | `success`, `fallback` 필드 |
| **디버깅** | 로그만 | `errorType`, `errorMessage` 제공 |

## 파일 위치

- API: `ai-roomchat/pages/api/ai-battle-judge.js`
- 함수: `processUnifiedGamePrompt()` catch 블록
- 커밋: `d5230f6f8`

## 다음 단계

- [ ] 클라이언트에서 `fallback: true` 감지 UI 구현
- [ ] 디버그 패널에 폴백 카운터 추가
- [ ] Play 모드에서 재시도 버튼 제공
