# Telemetry & Monitoring Plan

목표: 마이그레이션/러너/퍼저의 상태를 관찰하고 빠르게 대응하기 위한 최소한의 메트릭과 알람을 정의합니다.

권장 메트릭
- Migration: started, finished, success/failure, duration, backup_size
- Backup: artifact_upload_success, supabase_upload_success, checksum_mismatch
- Runner: job_started, job_finished, job_failed, job_timeout, peak_memory
- Fuzzer: runs_count, crashes_found, unique_crashes

알람
- Migration failure: 즉시 PagerDuty/Slack 알람
- Checksum mismatch: 고심각(복구 절차 수립)
- Runner timeouts spikes: 운영자에게 통보

대시보드
- Grafana / Supabase metrics 또는 Prometheus 연동 권장

데이터 보존
- 원시 로그는 (보안 검토 후) 30일 보관, 메트릭은 90일 요약 보관 권장
