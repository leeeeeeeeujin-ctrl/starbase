# Self-hosted Runner Quickstart

이 문서는 self-hosted runner를 운영하기 위한 간단한 퀵스타트 가이드입니다. 목적: 대용량 작업(특히 sandboxed runner) 또는 네트워크/리소스 제한이 있는 작업을 안전하게 실행.

권장 아키텍처
- VM(예: Ubuntu LTS) 또는 컨테이너 오케스트레이션에서 runner 실행
- runner는 최소 권한만 부여(리포지토 접근 토큰은 least-privilege)
- runner에서 실행되는 샌드박스(도커 컨테이너)는 네트워크, 디스크, CPU, 메모리 제한을 적용

빠른 시작
1. VM 준비(Ubuntu 22.04 권장)
2. Docker 설치
3. GitHub Runner 설치
   - `/home/runner/actions-runner`에 설치
   - 등록 토큰은 짧은 유효기간으로 발급
4. runner 실행 시 systemd 서비스로 등록

보안/운영 팁
- runner는 외부 접속이 불필요하면 private subnet에 놓습니다.
- runner에서 실행되는 모든 작업은 non-root로 실행합니다.
- runner에서 사용하는 임시 디스크는 작업 완료 후 자동으로 정리하도록 설정합니다.
