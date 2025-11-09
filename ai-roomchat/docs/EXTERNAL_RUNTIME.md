# External Runtime Proxy (Lightweight)

Purpose: allow your runtime code to call a server you control without coupling our server to your logic. This stays rate‑limited and domain‑allowlisted.

Endpoint:
- `POST /api/runtime/external-proxy?setId=&path=`

Workspace config (VFS file): `/runtime/external.config.json`
```json
{
  "rpm": 30,
  "domains": ["example.com"],
  "base": "https://api.example.com"
}
```

Rules:
- RPM enforced per (client IP, setId) over a 60s window.
- `path` is resolved against `base` (if provided) and must end with an allow‑listed domain.
- Only JSON bodies are forwarded (POST).

Client example (inside runner):
```js
await fetch(`/api/runtime/external-proxy?setId=${setId}&path=/exec`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ op: 'tick', data })
});
```

