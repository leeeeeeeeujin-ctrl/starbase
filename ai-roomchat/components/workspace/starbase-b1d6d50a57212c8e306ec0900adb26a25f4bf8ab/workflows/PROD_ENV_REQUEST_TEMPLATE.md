# Production Environment Request (copyable template)

아래 템플릿을 복사해서 레포 관리자(또는 조직 오너)에게 보내 `production` GitHub Environment를 생성하고 필요한 시크릿을 추가해 달라고 요청하세요.

-- 복사 시작 --
제목: [요청] GitHub Environment 생성 및 시크릿 추가 (`production`)

안녕하세요,

CI 마이그레이션 워크플로우(`.github/workflows/run-migrations.yml`)에서 `apply` 단계가 수동 승인된 보호된 `production` 환경을 요구합니다. 아래 환경과 시크릿을 설정해 주세요.

환경 이름: production

권장 설정:
- 최소 1~2명의 리뷰어(운영자)를 `Required reviewers`로 설정

환경 시크릿 (환경 단위, repository-level이 아님):
- MIGRATE_DATABASE_URL = postgresql://user:pass@host:5432/dbname  # session-pooler 주소 권장
- (선택) SUPABASE_SERVICE_ROLE_KEY = <service role key>  # 백업 폴백용. 매우 민감함
- (선택) SUPABASE_URL = https://<project-ref>.supabase.co
- (선택) SUPABASE_BUCKET = migration-backups

검증:
1) 시크릿 추가 후 스테이징에 대해 단순 dry-run을 실행하여 워크플로우가 시크릿을 읽는지 확인합니다.
2) `apply` job이 보호된 환경의 승인 없이 실행되지 않는지 테스트합니다.

감사합니다.

-- 복사 끝 --
