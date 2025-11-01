# Sandbox Hardening Plan (PoC → Production)

이 문서는 러너(샌드박스)를 운영 환경으로 안전하게 전환하기 위한 단계별 계획과 권고사항을 정리합니다.

목표
- 사용자 제공 코드/템플릿이 실행되더라도 호스트 시스템(서버 또는 기기)에 접근 불가능하게 격리
- 성능 저하를 최소화하면서도 공격 면을 줄이는 현실적 방안 제공

단계 요약
1) PoC: Docker 기반 격리 (현재 존재) — 빠른 실험 및 통합용
2) Hardened VM/Container: gVisor 또는 Firecracker 사용 — 멀티테넌시 및 보안 요구 충족
3) 이미지 서명 및 빌드 파이프라인: 신뢰된 런타임 이미지만 사용
4) 네트워크·파일시스템 격리 정책 강화

핵심 권고
- Non-root user: 컨테이너 내부는 반드시 non-root로 실행
- Seccomp / Capabilities: 최소 권한으로 프로세스 제한
- Network egress: 기본 차단, 필요 호스트만 허용(예: provider endpoints)
- Resource limits: CPU, memory, ephemeral disk, walltime enforced
- Image signing & digest pinning: 런타임 이미지는 서명하고 digest로 고정
- Logging & audit: 각 작업의 stdout/stderr, metadata를 중앙 로그에 저장

운영 체크리스트
- Canary pool: 소수 인스턴스에서 먼저 배포
- Auto-reaper: 시간 초과(예: 30s) 시 프로세스/컨테이너 강제 종료
- Quotas: 사용자/팀 당 동시 실행수 제한

참고 구현(간단)
- Docker PoC: `workflows/poc/docker_run_poc.sh` (이미 있음)
- Sandbox runner: `ai-roomchat/scripts/sandbox_run.js` (이미 있음)

다음 단계
1. PoC→Staging 전환: 이미지 서명/CI 연동
2. gVisor/Firecracker POC: 성능 측정 및 네트워크 정책 테스트
3. 운영 매뉴얼(복구·오류·보안 인시던트 대응)
