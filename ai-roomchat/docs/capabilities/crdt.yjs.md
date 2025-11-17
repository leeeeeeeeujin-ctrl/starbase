# Capability: crdt.yjs

> Yjs 기반 CRDT(shared state)를 사용하는 상태 동기화 capability.
> Status: phase 1 spec complete (reference_data 매핑; syncYjs 어댑터/adapterManager 연동 스켈레톤까지, 실제 도큐먼트 구조/게임 상태 매핑은 이후 단계).

---

## 1. Workspace 계약

- **역할**: 여러 클라이언트가 공유하는 상태(예: 보드 상태, 협업 편집 내용, 룸 메타)를  
  Yjs 문서를 통해 충돌 없이 동기화할 수 있게 하는 레이어.
- **필수 파일** (capabilityContracts 기준):
  - `/state/shared.yjs.json`
    - 역할:
      - “어떤 타입의 Yjs 문서를 어떤 키로 쓸지”를 선언하는 메타데이터 파일.
    - 예시 스키마(문서 수준):
      ```json
      {
        "docType": "yjs",
        "root": {
          "type": "map",
          "keys": {
            "world": { "type": "map" },
            "chat": { "type": "array" },
            "meta": { "type": "map" }
          }
        },
        "hints": {
          "world.grid": "/world/tilemap.json",
          "network.realtime": "/game/network.config.json"
        }
      }
      ```
    - 1단계에서는 “도큐먼트 구조를 설명하는 JSON” 정도만 요구하고,
      실제로 어떤 Y.Map/Y.Array를 어떻게 만들지는 adapter 쪽에서 결정한다.

---

## 2. 런타임 계약 (syncYjs 어댑터)

- **어댑터 id**: `crdt.yjs`
- **런타임 모듈**:
  - `ai-roomchat/lib/runtime/adapters/syncYjs.js`
    - `createYDoc(options?)`:
      - 내부에서 동적으로 `import('yjs')`를 시도하고, 실패 시 에러를 던진다.
      - 성공하면 `new Y.Doc()`를 만들어 반환.
    - `attachAwareness(provider)`:
      - y-protocols/awareness와 통합할 때 사용할 자리표시자(현재는 skeleton).
  - `ai-roomchat/lib/runtime/adapterManager.js`
    - `initAdapters(config, onEvent)` 안에서:
      - `config.sync.id === 'yjs'`인 경우:
        - `createYDoc()`을 호출해 `Y.Doc` 인스턴스를 생성.
        - 반환 객체의 `adapters.sync`에 `{ doc }`를 세팅.
        - dispose 시 `doc.destroy?.()`를 호출해 리소스를 정리.
- **게임/에디터에서 기대하는 형태 (설계)**:
  - `adapters.sync.doc`는 “협업 상태의 원천”으로 쓰이고,
  - 게임 런타임/Play overlay/에디터는 이 doc에 Yjs 자료구조를 붙여서 상태를 구성한다:
    - 예: `const worldMap = doc.getMap('world');`
    - 예: `const chat = doc.getArray('chat');`
  - 구체적인 타입/키 이름은 `/state/shared.yjs.json`에 선언해 두고,
    훗날 에디터가 이 파일을 읽어 “어떤 구조를 기대하는지”를 UI로 보여줄 수 있게 하는 것을 목표로 한다.

---

## 3. Play overlay / 메인 게임 연동 (설계)

crdt.yjs 자체는 렌더링을 담당하지 않고, 다른 capability와 결합해 “Shared state”를 제공한다.

- network.realtime과 결합:
  - `network.realtime`가 Y.Doc 업데이트를 네트워크 위로 싱크하는 역할을 맡는다.
  - 설계 예시:
    - 클라이언트:
      - `const { net, sync } = await initAdapters({ networking, sync: { id: 'yjs' } }, onEvent);`
      - `const doc = sync.doc;`
      - `doc.on('update', (update) => net.emit('yjs_update', update));`
    - 서버:
      - 각 room/match에 대한 Y.Doc를 유지하고, `yjs_update` 이벤트를 받아 병합 후 다시 브로드캐스트.
  - 1단계에서는 “이런 패턴으로 결합한다”는 수준까지만 문서화하고, 실제 서버/클라이언트 구현은 이후에 다룬다.
- world / ui와 결합:
  - world.grid.tilemap:
    - 월드 상태(플레이어 위치, 몬스터 hp 등)를 Y.Map/Y.Array로 저장하면,
      모든 클라이언트가 같은 월드 상태를 공유할 수 있다.
  - ui.text / ui.canvas2d:
    - Y.Doc에서 읽은 상태를 기반으로 텍스트/캔버스 UI를 갱신할 수 있다.
    - 예: `doc.on('update', () => rerenderCanvas(worldStateFromDoc()));`

---

## 4. reference_data 매핑

crdt.yjs capability는 다음 레퍼런스를 기반으로 설계된다.

- **Yjs**  
  - `reference_data/yjs-main/`
    - Y.Doc / Y.Map / Y.Array / awareness 개념.
    - 다양한 “협업 문서/보드” 예제에서 상태 구조/업데이트 패턴을 참고.
- **Automerge / 기타 CRDT**  
  - `reference_data/automerge-main/`
    - CRDT 기반 shared state를 어떻게 설계/버전 관리하는지에 대한 참고 자료.
    - 도큐먼트 구조 설계시 “머지 전략”을 고민할 때 유용.
- **웹 IDE / 협업 에디터**  
  - `reference_data/vscode-main/`, `reference_data/webcontainer-core-main/`
    - 공동 편집/동기화/세션 관리 패턴을 참고하는 용도.

1단계에서는 Yjs를 직접 포함하지 않고,  
“어떤 파일/어댑터/참조 엔진이 crdt.yjs capability에 연결되는지”를 문서로 먼저 확정해 둔다.  
실제 도큐먼트 스키마와 Yjs 업데이트 흐름(에디터/게임 ↔ 네트워크 ↔ 서버)은 이후 단계에서 세부 설계/구현을 진행한다.

