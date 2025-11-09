# Production Environment Variables

Created: 2025-10-30
Purpose: central reference for environment variables required to run the ai-roomchat service in production (secrets, formats, generation commands, and where to store them).

IMPORTANT: Never commit real secrets to git. Use CI secrets, cloud secret stores, or Docker secrets.

---

## Required variables (minimum)

- NODE_ENV
  - Description: runtime mode. Set to `production` in production.
  - Example: `production`

- PORT
  - Description: HTTP port the Next.js dev server / server runs on.
  - Example: `3000`

- HOST
  - Description: Host binding. Often `0.0.0.0` in containers, or specific interface.
  - Example: `0.0.0.0`

- MASTER_KEY_HEX
  - Description: 32-byte (256-bit) master key used to encrypt device secrets (AES-256-GCM). MUST be provided in hex (64 hex characters = 32 bytes).
  - Required by: `ai-roomchat/pages/api/devices/register.js` and `.../verify.js` to encrypt/decrypt device secrets.
  - Example (generate):
    - Node: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    - OpenSSL: `openssl rand -hex 32`
  - Example value (DO NOT USE): `9af3b1... (64 hex chars)`

- DATABASE_URL or SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL
  - Description: connection details for the primary DB (Postgres/Supabase). If using Supabase, keep service role key for migrations in CI and use restricted keys for runtime.
  - Example: `postgres://user:pass@host:5432/dbname`
  - Supabase alternative:
    - `SUPABASE_URL` e.g. `https://xyzcompany.supabase.co`
    - `SUPABASE_SERVICE_ROLE_KEY` (sensitive)

- REDIS_URL (recommended)
  - Description: URL for Redis used for nonce dedupe, rate limiting, job queues, caching.
  - Example: `redis://:password@redis-host:6379/0`

- ADMIN_PORTAL_PASSWORD (optional)
  - Description: admin password used by local dev scripts (if you keep admin-only endpoints). Prefer external auth in production.
  - Example: set strong password or remove usage in production.

- SENTRY_DSN (optional)
  - Description: Application error monitoring DSN.

- JWT_SECRET or NEXTAUTH_SECRET (if using JWT/OAuth)
  - Description: Signing secret for tokens. Generate a long random secret (64+ bytes hex recommended).
  - Generation: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

---

## Runner / device-related variables

- DEVICE_RUNNER_ALLOWED
  - Description: boolean/flag to allow local device-runner forwarding or to disable entirely in production for security.
  - Example: `true` or `false` (recommended: `false` by default)

- RUNNER_VERIFY_ENDPOINT (optional)
  - Description: URL where runner signatures are verified (if runner separate service). For our current design, verification is handled by `/api/devices/verify` in the server.

- RUNNER_SHARED_SECRET (optional)
  - Description: legacy shared secret header for simple local-runner compatibility (`x-runner-secret`). Use only for private networks and dev.

Note about Sentry (옵션)

 - Sentry는 선택적입니다. `SENTRY_DSN`이 설정된 경우에만 초기화되며, 기본적으로는 로그/오류 수집을 사용하지 않습니다.
 - 코드에는 `@sentry/nextjs`를 사용한 초기화 파일이 포함되어 있으며, `beforeSend` 훅에서 기본적인 PII(개인 식별 정보) 필터링을 수행합니다. 실제로 이벤트를 전송하려면 Vercel 또는 배포 환경의 `SENTRY_DSN`을 설정하세요.


---

## CI & deployment considerations

- In CI (GitHub Actions), set secrets in repository/organization settings. Do NOT store them in the repo.
  - Example GitHub Secrets:
    - `MASTER_KEY_HEX`
    - `DATABASE_URL` (or `SUPABASE_SERVICE_ROLE_KEY`)
    - `REDIS_URL`
    - `SENTRY_DSN`

- For Kubernetes/Docker Swarm:
  - Use Kubernetes Secrets or Docker secrets, not environment variables in plain manifests.

- For serverless platforms (Vercel, Netlify, AWS Lambda):
  - Use their secret/environment settings UI. Some platforms have restrictions on variable lengths.

- For local development, create `.env.local` (gitignored) and copy `.env.example` (do not commit secrets). Example file below.

---

## Example `.env.example`

# runtime
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

# encryption (generate with openssl or node)
MASTER_KEY_HEX=<GENERATE_WITH_openssl_or_node>

# database (choose one pattern)
# DATABASE_URL=postgres://user:pass@host:5432/dbname
# or for Supabase
# SUPABASE_URL=https://<project>.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>

# redis (optional)
# REDIS_URL=redis://:password@host:6379/0

# optional
# JWT_SECRET=<long-random-hex>
# SENTRY_DSN=
# ADMIN_PORTAL_PASSWORD=

---

## Operations checklist (production hardening)

- Store `MASTER_KEY_HEX` in a KMS or CI secret store and never commit it.
- Use DB credentials with least privilege for runtime; keep migration keys in CI only.
- Use Redis (or another central store) for nonce dedupe in multi-instance setups.
- Rotate `MASTER_KEY_HEX` and rotate stored encrypted secrets carefully (plan re-encryption).
- Add monitoring/alerting for failed signature verifications and repeated nonce/replay attempts.

---

## Where to document and put these variables

- Keep this file (`ai-roomchat/docs/PROD_ENV_VARS.md`) in repo docs.
- Add a `.env.example` at the project root (committed, without secrets) to show format.
- Add a README section or `ai-roomchat/README.md` pointer to this doc.
- In CI (GitHub Actions), store secrets in repository Settings → Secrets and reference them in workflows.

---

If you want, I can:
- Create `ai-roomchat/.env.example` file (safe example, no secrets) and add a pointer in the top-level `README.md` or `ai-roomchat/README.md`.
- Add a short GitHub Actions snippet to show how to inject secrets and run migrations.

Tell me which follow-up you want and I'll implement it now.

## 예시 값 및 Vercel에 넣는 방법 (한국어)

아래는 운영 환경에서 필요한 환경 변수들의 예시 값(플레이스홀더)과, 값을 생성/확인하는 방법, 그리고 Vercel에 넣는 방법을 한국어로 정리한 섹션입니다. 실제 비밀값은 절대 저장소에 커밋하지 마세요. Vercel(또는 배포 환경)의 Secrets/Environment settings에 넣으면 됩니다.

주의: 아래에 예시로 표시한 값은 예시(플레이스홀더)입니다. 실제 운영값은 아래 명령어나 서비스에서 생성한 값을 사용하세요.

예시 변수 및 설명

- NODE_ENV
  - 설명: 런타임 모드(프로덕션은 `production`).
  - 예시 값: `production`

- PORT
  - 설명: 서버가 바인딩할 포트.
  - 예시 값: `3000`

- HOST
  - 설명: 바인딩 호스트. 컨테이너에서는 일반적으로 `0.0.0.0`.
  - 예시 값: `0.0.0.0`

- MASTER_KEY_HEX (중요)
  - 설명: AES-256-GCM로 디바이스 시크릿을 암호화/복호화할 때 사용하는 32바이트(256비트) 마스터 키의 HEX 표현(64 hex chars).
  - 생성 방법(로컬 안전 명령):
    - Node: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    - OpenSSL: `openssl rand -hex 32`
  - 예시(플레이스홀더): `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` (64 hex chars) ← 실제로는 위 명령으로 생성한 값을 사용하세요.
  - 어디에 넣나: Vercel Dashboard → Project → Settings → Environment Variables 에 `MASTER_KEY_HEX` 로 추가.

- DATABASE_URL 또는 SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY
  - 설명: 주 DB 연결 문자열. Supabase를 사용하는 경우 `SUPABASE_URL` 과 `SUPABASE_SERVICE_ROLE_KEY` 를 사용하세요. 마이그레이션 작업은 CI에서 서비스 역할 키로 수행하세요.
  - 찾는 방법: Supabase 콘솔 → Settings → API 에서 `URL` 과 `Service Role` 키를 확인.
  - 예시(플레이스홀더): `postgres://username:password@db-host:5432/dbname`
  - Vercel에 넣는 방법: `DATABASE_URL` 또는 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` 를 환경변수로 추가.

- REDIS_URL (권장)
  - 설명: Redis 접속 URL. nonce dedupe(재전송 차단), 캐시, 작업 큐 등에 사용.
  - 예시: `redis://:password@redis-host:6379/0`
  - 로컬에서 빠르게 테스트: `docker run -p 6379:6379 -d redis:7` 그리고 `REDIS_URL=redis://localhost:6379`

- ADMIN_PORTAL_PASSWORD (선택)
  - 설명: 간단한 admin 보호용 비밀번호(개인용 또는 초기 dev 용). 프로덕션에서는 OAuth나 더 안전한 인증을 권장.
  - 예시: `very-strong-password-here`

- JWT_SECRET 또는 NEXTAUTH_SECRET
  - 설명: JWT 또는 NextAuth 등의 토큰 서명용 시크릿.
  - 생성: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

Runner/디바이스 관련 변수

- DEVICE_RUNNER_ALLOWED
  - 설명: 클라이언트가 로컬/원격 runner 포워딩을 사용 가능한지 제어하는 플래그.
  - 예시: `false` (권장: 기본 false)

- RUNNER_VERIFY_ENDPOINT
  - 설명: 서명 검증을 별도 서비스에서 처리할 경우 해당 URL을 지정. 기본적으로는 앱의 `/api/devices/verify-signature` 를 사용.

- RUNNER_SHARED_SECRET
  - 설명: 로컬 전용 레거시 헤더(`x-runner-secret`)를 위한 시크릿. 내부 네트워크에서만 사용.

Vercel에 환경변수 추가 방법 (요약)

1. Vercel Dashboard 에 접속하여 해당 프로젝트를 연다.
2. 왼쪽 메뉴 → Settings → Environment Variables 로 이동한다.
3. `Name` 에 변수명(e.g. `MASTER_KEY_HEX`), `Value` 에 실제로 생성한 시크릿을 붙여넣고, Environment(Production/Preview/Development)를 선택한다.
4. Save 를 눌러 저장한다.
5. 배포(Deploy) 또는 Redeploy 를 트리거하여 변경사항을 반영한다.

예시 `.env.example` (커밋 가능, 실제 비밀 없음)

```
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
# MASTER_KEY_HEX=openssl rand -hex 32
# DATABASE_URL=postgres://user:pass@host:5432/db
# SUPABASE_URL=https://<your>.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=
# REDIS_URL=redis://:password@redis-host:6379/0
# JWT_SECRET=
# ADMIN_PORTAL_PASSWORD=
```

테스트 및 운영 팁

- MASTER_KEY_HEX 교체(로테이션) 계획을 세우세요. 기존에 암호화된 시크릿을 재암호화하는 절차가 필요합니다.
- Redis 를 운영 환경에서 활성화하면 다중 인스턴스에서 nonce 재전송 차단이 정확하게 동작합니다.
- CI에서 마이그레이션을 자동화할 때는 서비스 역할 키(예: Supabase 서비스 역할)를 사용하고, 해당 키는 저장소의 Secrets에만 넣으세요.

도와드릴 내용 (원하시면 바로 진행)

- (A) 이 문서 기반으로 `ai-roomchat/.env.example` 파일을 생성해 커밋.
- (B) Vercel 적용용 짧은 체크리스트와 GitHub Actions 예시 워크플로우 템플릿 추가.
- (C) `MASTER_KEY_HEX` 로테이션 스크립트 초안 작성(재암호화 절차 포함).

원하시는 항목(A/B/C) 골라주세요. 제가 바로 구현해 드리겠습니다.
