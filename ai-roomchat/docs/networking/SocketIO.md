# Networking — Socket.IO

이 가이드는 Socket.IO를 이용해 런타임 이벤트를 브로드캐스트/수신하는 방법을 설명합니다. UI 변경 없이 파일과 훅만으로 구성합니다.

구성 파일

- `/game/adapters.config.json`

예시

```
{
  "renderer": "canvas2d",
  "input": ["keyboard"],
  "networking": { "id": "socketio", "url": "https://your-socket.example", "token": null },
  "sync": null
}
```

동작 모델

- 런타임 이벤트 객체: `{ type, payload, room, id, ts }`
- 네트워크 전송: `emit('evt', event)`
- 네트워크 수신: `on('evt', (event) => apply(event))`

클라이언트 어댑터

- 코드: `lib/runtime/adapters/netSocketIO.js` (`connectSocketIO`)
- 의존성: `socket.io-client`

서버

- 서버가 `evt` 이벤트를 브로드캐스트하도록 설정합니다.

주의

- 의존성이 없으면 연결 시도가 무시되거나 오류로 처리됩니다(가드 필요).
- 토큰 등 인증은 `auth` 필드로 전달하고 서버에서 검증하세요.

