# Local Redis for Proxy E2E

이 문서는 로컬 개발 환경에서 Redis를 띄워 `ai-roomchat`의 proxy E2E(토큰 폐기 포함)를 실행하는 방법을 설명합니다.

요약
- `docker compose -f docker-compose.redis.yml up -d`로 Redis를 띄웁니다.
- 환경 변수 `REDIS_URL=redis://127.0.0.1:6379`를 설정한 뒤 E2E 스크립트를 실행합니다.

예시 (PowerShell):

```powershell
# 프로젝트 루트에서
docker compose -f docker-compose.redis.yml up -d

# (선택) 환경 변수 로드
$env:REDIS_URL = 'redis://127.0.0.1:6379'

# ai-roomchat 디렉토리로 이동 후 E2E 실행
cd .\ai-roomchat
node tests\proxy\run_e2e_proxy.js
```

CI
-- `.github/workflows/proxy-e2e.yml`에서 Redis 서비스를 추가해 이미 CI에서 토큰 폐기 테스트가 실행되도록 구성했습니다.

주의
- 이 PoC는 로컬 개발 편의성을 위해 단순화되어 있으며, 실제 운영환경에서는 Redis 접속 정보와 시크릿 관리를 보호된 GitHub Environment/Secrets로 처리해야 합니다.
