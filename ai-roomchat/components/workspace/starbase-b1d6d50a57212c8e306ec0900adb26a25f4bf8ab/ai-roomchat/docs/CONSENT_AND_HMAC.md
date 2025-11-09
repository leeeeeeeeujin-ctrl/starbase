# Consent Modal & Device Registration / HMAC Signing Spec

Created: 2025-10-30
Purpose: Provide a single reference for the UI consent flow, device registration endpoints, HMAC signing format, and server verification examples. This is intended to be human-readable and copyable into implementation files.

---

## 1) Consent modal (UX copy)

Title: "Run prompt on this device"
Body: "This action will execute a prompt using your local runner. The runner may access local files or network depending on the template's capabilities. By continuing you explicitly consent to this execution and agree that a record of this run (metadata only) will be logged for audit. If you do not want local execution, choose 'Run on Server' or configure a remote runner in settings."

Checkbox (required): "I understand and consent to run this prompt on this device."

Buttons:
- "Run on this device" (primary, enabled only when checkbox checked)
- "Run on server / Cancel" (secondary)

Small note under buttons: "You can revoke consent later in Settings → Runners. Each run is logged with a timestamp and device id. Sensitive outputs will be redacted unless you opt-in to store full output."

Acceptance: Modal appears before any request that will trigger local or external runner execution; the user's choice and timestamp are saved to audit store.

---

## 2) Device registration flow (minimal)

1) Client POST /api/devices/register
   - body: { name, platform, publicKey? }
   - server: creates device record { id: uuid, name, platform, created_at } and a secret key (random 32+ byte) that is returned ONCE.
   - Response: { device_id, device_secret }  (client must store device_secret securely; server only stores device_id + hash/derived key)

2) Client stores device_secret securely (Web: IndexedDB/secure storage; Mobile: Keystore/Keychain; Desktop: OS-protected credential store)

3) Device can request device token or use device_secret to HMAC-sign run requests directly.

Security note: device_secret is sensitive — do not log or commit it. If lost, user must re-register device.

---

## 3) HMAC signing spec (recommended)

- Algorithm: HMAC-SHA256
- Header names:
  - `X-Device-Id`: device id (UUID)
  - `X-Request-Timestamp`: unix epoch seconds
  - `X-Request-Nonce`: random 16+ byte hex
  - `X-Client-Signature`: hmac hex
- Signing input (string):
  - `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`
  - `bodyHash` = hex(SHA256(body)) — for empty body use hex(SHA256(''))
- Signature: hex(HMAC_SHA256(device_secret, signing_input))
- Replay protection: server allows timestamp window (e.g., ±120s) and rejects duplicate nonces for the same device within a short period.

Example header set:
- X-Device-Id: 3f8f7a2e-...
- X-Request-Timestamp: 1700000000
- X-Request-Nonce: b2f1a3...
- X-Client-Signature: 4a6b3c...

Acceptance: Server verifies signature, timestamp, and nonce before executing run requests.

---

## 4) Browser client example (Web Crypto API)

// helper: compute HMAC-SHA256 with WebCrypto
```js
async function importHmacKey(rawKey) {
  const keyBytes = new TextEncoder().encode(rawKey);
  return crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function signRequest(deviceSecret, method, path, body=''){
  const ts = Math.floor(Date.now()/1000).toString();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const nonceHex = Array.from(nonce).map(b => b.toString(16).padStart(2,'0')).join('');
  const bodyHash = await sha256Hex(body);
  const signingInput = `${method}\n${path}\n${ts}\n${nonceHex}\n${bodyHash}`;

  const key = await importHmacKey(deviceSecret);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const sigHex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
  return { ts, nonce: nonceHex, sig: sigHex };
}
```

Client usage (PromptEditor run):
- Ensure consent modal confirmed.
- Build body (JSON), call `signRequest(deviceSecret, 'POST', '/api/runner/run', JSON.stringify(body))` and attach headers.

---

## 5) Server verification example (Node.js)

```js
const crypto = require('crypto');

function sha256Hex(buf){
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function hmacHex(key, msg){
  return crypto.createHmac('sha256', key).update(msg).digest('hex');
}

function verifyRequest({deviceId, timestamp, nonce, signature, method, path, body}, getDeviceSecret){
  const now = Math.floor(Date.now()/1000);
  if(Math.abs(now - Number(timestamp)) > 120) return false; // timestamp window
  // check nonce uniqueness per device (store short-lived nonces)

  const bodyHash = sha256Hex(body || '');
  const signingInput = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const secret = getDeviceSecret(deviceId); // MUST return raw secret bytes
  const expected = hmacHex(secret, signingInput);
  return crypto.timingSafeEqual(Buffer.from(expected,'hex'), Buffer.from(signature,'hex'));
}
```

Server: before executing run, call verifyRequest with stored/derived secret. If invalid, return 401.

---

## 6) Minimal API endpoints (spec)

- POST `/api/devices/register`
  - request: { name, platform }
  - response: { device_id, device_secret }

- POST `/api/runner/run`
  - requires HMAC headers and consent record. Body: { template_id, inputs, runner_config? }
  - server verifies signature and consent; if runner is remote or user-configured, forward request. For local runner, optionally accept only when device_id matches and run-from-client consent is present.

- POST `/api/audit/run-event`
  - body: { device_id, user_id, template_id, consent_ts, summary, redacted_output_flag }
  - writes to audit log (DB or file-fallback)

---

## 7) Acceptance criteria / next dev steps

- Draft consent modal implementation in `PromptEditor` and hook into run flow (require checkbox; save consent event to audit endpoint).
- Implement `/api/devices/register` server route and store device records (and hashed secret). Return secret on registration.
- Implement client signRequest helper in PromptEditor and attach headers when calling `/api/runner/run`.
- Implement server verifyRequest and nonce storage to prevent replay.

---

## 8) Security notes / reminders

- Never store raw `device_secret` in logs or in git. Store only hashed variants if needed.
- Leverage OS-provided secure storage for secrets on mobile/desktop.
- Default: CLI runs disabled until user opts-in.
- Consider adding a rate limit and quota per-device to mitigate compromise.

---

If you want, I can now:
- Implement the `POST /api/devices/register` route (server stub) and update `PromptEditor.js` to call it and persist the returned secret in browser storage (IndexedDB/localStorage adapter) — then wire the signing helper into the Run flow.
- Or I can implement the consent modal UI and wire it to the existing Run button so we can test the consent flow immediately.

Tell me which to do first and I'll update the todo list and implement it in the repo.