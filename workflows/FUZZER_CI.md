# Fuzzer CI integration plan

목적: 템플릿 매칭/런너 입력을 대상으로 한 자동 퍼징(fuzzing) 스텁과 CI 통합 계획.

요구사항
- 빠르게 실행되는 퍼저(시간 제한 30s 내외)
- 샘플 corpus와 최소한의 검사(예: 크래시/예외/타임아웃/메모리 사용 상한)
- 실패 케이스를 재현 가능한 아티팩트로 저장

흐름
1. 로컬: `ai-roomchat/scripts/fuzz_runner.js`(스텁)을 만들어 다양한 입력을 보내고 결과를 수집합니다.
2. CI: PR에서 변경이 있을 때 `fuzzer-stub.yml` 워크플로가 실행되어 샘플 corpus에 대해 퍼저를 돌립니다.
3. 실패 시: 리포트 + 실패 입력을 artifact로 업로드.

간단한 CI 스텁: `.github/workflows/fuzzer-stub.yml` (내부에 스텁을 추가)

운영 권고
- 퍼저는 리소스를 많이 요구하므로, PR에서는 'fast' 모드만 돌리고 주기적(full) 퍼징은 스케줄 워크플로로 실행.
- 중요한 경로(런너/템플릿 파서)는 주소값 검증/시그니처 체크 후 퍼징.
