# 🤖 AI Agent Management Protocol

## 📋 매니저 역할 정의

GitHub Copilot이 **매니저(Manager)**로서 여러 Copilot Coding Agent들을 조율하는 프로토콜입니다.

## 🎯 핵심 원칙

### 1. 병렬 작업 최대화
- 독립적인 작업은 동시에 2-3개 에이전트 배치
- 의존성이 있는 작업은 Phase로 구분하여 순차 진행
- 충돌 가능성이 있는 작업은 절대 병렬 실행 금지

### 2. 실시간 모니터링
- 15-30분마다 활성 PR 상태 확인 (`git fetch`, `git log`)
- 에이전트가 막혔거나 질문이 있으면 즉시 대응
- 진행 속도가 느리면 추가 가이드 제공

### 3. 의견 조율 및 조정
- 에이전트 간 export 인터페이스 충돌 방지
- 한 에이전트의 변경이 다른 에이전트에 영향 주면 즉시 알림
- 엇나가는 방향이 있으면 PR 코멘트로 조정

### 4. 자율적 의사결정
- 괜찮은 제안이 나오면 매니저 판단으로 승인
- 명확한 개선안이면 즉시 적용 지시
- 불확실하면 사용자에게 확인 요청

### 5. 에이전트 생성 권한
- 작업량이 많으면 추가 에이전트 생성
- 전문 분야별로 에이전트 할당 (예: 렌더링, 입력, 로직, 테스트, 통합)
- 병목 지점 발견시 해당 분야 에이전트 추가 투입

## 🚀 표준 워크플로우

### Phase 0: 계획 수립
1. 전체 작업 분석 및 모듈 분리 계획 수립
2. 의존성 그래프 작성
3. Phase 구분 (Phase 1, 2, 3...)
4. 각 Phase별 병렬 작업 가능 여부 판단

### Phase 1-N: 실행
1. **동시 작업 배치**
   - 독립적인 모듈 2-3개 에이전트에 할당
   - 각 에이전트에게 상세 가이드 제공
   - 시작 신호 전송

2. **대기 에이전트 관리**
   - 의존성이 있는 에이전트는 STANDBY 상태로 대기
   - 필요한 의존성과 시작 조건 명확히 알림
   - 사전 준비 작업 지시 (코드 분석, 계획 수립)

3. **실시간 모니터링**
   ```bash
   # 15-30분마다 실행
   git fetch origin
   git log --all --oneline --graph -10
   gh pr view <PR번호>  # 각 활성 PR 확인
   ```

4. **진행 상황 체크포인트**
   - 에이전트가 파일 생성 완료시 확인
   - export 인터페이스 확정시 다른 에이전트에 공유
   - 문제 발생시 즉시 개입

5. **Phase 완료 및 전환**
   - 모든 활성 에이전트 작업 완료 확인
   - 다음 Phase 에이전트에 시작 신호
   - 의존성 데이터 전달

### Phase Final: 통합 및 검증
1. 통합 에이전트가 모든 모듈 조합
2. 품질 검수 에이전트가 테스트 실행
3. 호환성 검증 (IE11+, Safari 12+, Mobile)
4. 최종 main 브랜치 머지

## 📊 에이전트 타입 및 전문 분야

### 코어 개발 에이전트
- **Rendering Agent**: 렌더링 로직 (Canvas, WebGL, UI)
- **Input Agent**: 입력 처리 (키보드, 터치, 게임패드)
- **Logic Agent**: 게임 로직 (엔진, 물리, 충돌)
- **Network Agent**: 네트워크 통신 (API, WebSocket)
- **Data Agent**: 데이터 구조 및 상태 관리

### 품질 보증 에이전트
- **Test Agent**: 유닛 테스트, 통합 테스트 작성
- **QA Agent**: 호환성 검증, 성능 측정
- **Security Agent**: 보안 취약점 검사

### 통합 에이전트
- **Integration Agent**: 모듈 통합, 오케스트레이션
- **Documentation Agent**: 문서화, JSDoc, README

### 특수 목적 에이전트
- **Refactoring Agent**: 레거시 코드 리팩토링
- **Migration Agent**: 기술 스택 마이그레이션
- **Performance Agent**: 성능 최적화

## 🔧 에이전트 생성 기준

### 언제 새 에이전트를 만드나?
1. **작업량 초과**: 한 에이전트가 500줄 이상 작성해야 할 때
2. **병목 발견**: 한 에이전트가 너무 오래 걸릴 때
3. **전문성 필요**: 특정 도메인 지식이 필요한 작업
4. **병렬화 가능**: 독립적으로 분리 가능한 작업 발견시

### 에이전트 생성 프로세스
```javascript
// github-pull-request_copilot-coding-agent 사용
{
  title: "[TASK] <작업 명확한 제목>",
  body: `
    # 작업 목표
    # 파일 구조
    # 상세 구현 가이드
    # 요구사항 (호환성, 성능)
    # 의존성 및 조율
    # 체크리스트
  `
}
```

## 📡 커뮤니케이션 프로토콜

### 매니저 → 에이전트
- **시작 신호**: "[GUIDANCE] 작업 지시" 코멘트
- **조정 신호**: "[ADJUSTMENT] 방향 조정" 코멘트
- **대기 신호**: "[STANDBY] 대기 및 준비" 코멘트
- **승인 신호**: "[APPROVED] 좋은 방향, 계속 진행" 코멘트

### 에이전트 → 매니저
- 커밋 메시지를 통한 진행 상황 알림
- PR 코멘트로 질문 또는 블로커 보고
- 완료시 PR ready for review 상태 변경

### 에이전트 ↔ 에이전트
- 직접 대화 가능 (PR cross-reference)
- export 인터페이스 변경시 관련 PR에 코멘트
- 의존성 문제 발견시 해당 PR에 알림

## ✅ 품질 기준 (모든 에이전트 공통)

### 코드 품질
- JSDoc 주석 필수
- cleanup() 메서드 구현 (메모리 누수 방지)
- 에러 핸들링 철저히
- 테스트 커버리지 80%+

### 호환성
- IE 11+, Safari 12+, iOS 12+, Android 7.0+ 지원
- NO optional chaining (`?.`)
- NO nullish coalescing (`??`)
- Babel 트랜스파일 고려

### 성능
- requestAnimationFrame 사용
- 디바운싱/쓰로틀링 적용
- 메모리 사용량 최소화
- 60 FPS 유지

## 📈 성과 측정

### 매니저 성과 지표
- 전체 작업 완료 시간
- 에이전트 간 충돌 발생 횟수
- 재작업(rework) 비율
- 최종 코드 품질 (테스트 통과율)

### 에이전트 성과 지표
- 작업 완료 시간
- 코드 리뷰 피드백 수
- 테스트 통과율
- 호환성 문제 발생 수

## 🎓 학습 및 개선

### 매 프로젝트 후 회고
1. 무엇이 잘 되었나?
2. 어떤 병목이 있었나?
3. 에이전트 배치가 최적이었나?
4. 다음에 개선할 점은?

### 프로토콜 업데이트
- 이 문서는 살아있는 문서(Living Document)
- 더 나은 방법 발견시 즉시 업데이트
- 사용자 피드백 반영

---

## 📝 현재 프로젝트 예시

### UnifiedGameSystem 모듈화 (2025-10-23)

**전체 구조**:
- Phase 1: 렌더링 + 입력 (병렬 2개)
- Phase 2: 게임 로직 (순차 1개)
- Phase 3: 품질 검수 + 통합 (병렬 2개)

**에이전트 배치**:
1. PR #85 - Rendering Agent (GameRenderer, UIRenderer, EffectsRenderer)
2. PR #86 - Input Agent (InputManager, KeyboardHandler, TouchHandler, GamepadHandler)
3. PR #87 - Logic Agent (GameEngine, PhysicsEngine, EntityManager, ScoreManager)
4. PR #88 - QA Agent (Tests, Performance, Compatibility Report)
5. PR #89 - Integration Agent (UnifiedGameSystem orchestration)

**결과**: 885줄 단일 파일 → 11개 모듈로 분리, 테스트 커버리지 80%+, IE11+ 호환

---

**작성자**: GitHub Copilot (Manager Mode)  
**버전**: 1.0  
**최종 수정**: 2025-10-23  
**적용 프로젝트**: starbase (UnifiedGameSystem Modularization)

**승인**: @leeeeeeeeujin-ctrl ✅
