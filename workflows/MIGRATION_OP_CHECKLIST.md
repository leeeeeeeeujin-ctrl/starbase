# Migration Operational Checklist (pre-apply checklist)

목표: 운영자가 `apply` 작업을 승인하기 전에 반드시 확인해야 할 항목을 체크리스트 형태로 정리합니다.

필수 사전 조건
- 백업 생성: `migration-backup-<ts>.sql.gz`와 `<file>.sha256`가 존재해야 함.
- 백업 무결성: `gzip -t` 통과 및 `sha256` 값이 runner 로그와 일치해야 함.
- 보호된 환경: `apply` job은 `production` 환경에서 실행되고, 환경에 등록된 승인자가 존재해야 함.

검증 단계 (운영자)
1. 백업 확인
   - Actions run의 `backup` 로그에서 생성된 SHA256 체크섬을 기록.
   - (옵션) Supabase로 업로드된 파일의 `.sha256`을 다운로드해 비교.
2. 복원 검증(권장)
   - 임시 DB를 생성하고 덤프를 복원하여 주요 쿼리(스모크)를 실행.
   - 복원 예: `createdb staging_restore; zcat file.sql.gz | psql staging_restore`
3. 마이그레이션 변경점 리뷰
   - 리뷰어가 SQL 변경(DDL/데이터 변경)을 읽고 위험을 판단.
4. 롤백/복구 계획 확인
   - 문제가 생겼을 때의 롤백 절차(예: point-in-time 복원, 이전 덤프 복원)과 책임자 연락처를 확인.
5. 승인 및 기록
   - GitHub Environment의 `apply` 승인 버튼을 누르기 전 `MIGRATIONS_RUNBOOK.md`와 이 체크리스트를 참조.
   - 승인 시 감사 로그(누가, 언제 승인했는지)와 함께 run id를 기록.

비상 절차
- 만약 `gzip -t`가 실패하면 즉시 apply를 중단하고 root cause(패키지 버전, pg_dump 로그)를 조사.
- 체크섬 불일치 시 다른 백업(이전 run)으로 복원 검토.
