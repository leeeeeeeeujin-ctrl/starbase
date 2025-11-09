# Server-side Sandbox PoC (options & recommended path)

목표: 서버-사이드에서 사용자가 제출한 템플릿/작업을 안전하게 실행하기 위한 PoC(Proof of Concept)를 설계합니다. 핵심 요구는 '격리', '자원 제한', '옵저버빌리티', '신속한 청소(cleanup)' 입니다.

요약 비교
- Docker (표준 컨테이너): 설정이 쉽고 친숙함. 네트워크/볼륨/유저 권한을 제어하기 쉬움. 그러나 커널 공유로 인해 커널-레벨 공격 표면이 존재.
- gVisor: 사용자 공간에서 추가적인 가상화 레이어를 제공해 컨테이너 격리 강화. Docker보다 더 안전하지만 설정·운영 복잡성 증가.
- Firecracker: 경량 VMM으로 빠른 시작과 강한 분리 제공. 오버헤드는 더 크나 보안 수준이 높음. 다만 운영 복잡성·자원 요구가 높음.
- Wasm-based sandbox (server-side WASM runtimes like Wasmtime, Wasmer, or Lucet): 함수 수준의 매우 강한 격리와 빠른 시작. 네트워크·FS 접근을 컴포넌트로 명시적으로 허용해야 함.

권장 PoC 경로 (단계적)
1) 빠른 PoC — Docker + seccomp + cgroups
  - 목표: 최소 노력으로 작동하는 안전 경계 확보
  - 구현: 각 작업을 별도 Docker 컨테이너로 실행(예: ephemeral container per run). 사용자는 작업 시작 시 이미지(고정 베이스)로 컨테이너를 생성.
  - 제한: cgroups로 CPU/메모리 제한, seccomp 프로파일로 시스템 콜 필터링, 파일 시스템은 읽기 전용으로 마운트, 네트워크는 기본적으로 차단(필요 시 화이트리스트)
  - 검증: 컨테이너가 30초 이상 실행되면 강제 kill, 프로세스가 남지 않음을 확인.

2) 중간 PoC — gVisor (runsc)로 강화
  - Docker 위에서 gVisor를 사용하여 커널 호출을 가로채고 유효성 검사를 강화.
  - 장점: 공격 표면 감소, 기존 Docker 도구 흐름과 일부 호환.

3) 향후(고안): Firecracker 또는 Wasm 런타임
  - Firecracker: 멀티 테넌트 퍼포먼스 필요 시 추천. VM 수준 격리 제공.
  - Server-side Wasm: 템플릿 전처리/변환 로직을 Wasm으로 제한할 수 있다면 더 안전하고 더 빠름. 그러나 기존 코드 실행(특히 네이티브 바이너리 호출)은 어렵다.

PoC 수용 기준(예시)
- 리소스 제한: 실행당 CPU <= 1 core, 메모리 <= 256MB, 실행 시간 <= 30s
- 네트워크: 기본 차단, 승인된 호스트만 egress 허용
- 파일시스템: 작업 전용 임시 볼륨(격리) 사용, 작업 종료 시 볼륨 자동 삭제
- 로그/감사: 모든 실행에 대해 이벤트(시작, 종료, exitCode, stdout/stderr 샘플(크기 한정))를 audit store에 저장

테스트 케이스
1. 정상적인 템플릿 실행(간단 치환) 성공
2. 무한 루프(시간 초과) → 타임아웃 및 프로세스 종료
3. 시도된 FS 접근(/etc/passwd 등) 차단
4. 네트워크 egress 시도 차단

다음 단계(제가 할 수 있는 것)
- PoC Docker repo 스크립트(간단한 run.sh)와 `docker run` 예제 생성
- gVisor 테스트 지침 문서 작성
- 서버-side Wasm PoC 제안서 및 샘플 코드(Wasmtime) 초안

원하시면 바로 Docker PoC 스크립트와 간단한 테스트 케이스를 레포에 추가하겠습니다.
