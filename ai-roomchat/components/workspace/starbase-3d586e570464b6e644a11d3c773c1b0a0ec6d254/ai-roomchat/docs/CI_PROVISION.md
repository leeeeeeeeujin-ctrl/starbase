# CI device provisioning (example)

This doc shows a minimal example for provisioning devices from CI (GitHub Actions) using a CI-only registration token.

1. In your repository settings → Secrets, add:
   - `CI_REGISTRATION_TOKEN` — a long random secret used by CI to call `/api/devices/register`.
   - `APP_URL` — the public URL of your deployed app (e.g. https://my-app.vercel.app).

2. Set server-side environment variables in the deployment environment (Vercel / server):
   - `REGISTRATION_CI_ONLY=true`
   - `CI_REGISTRATION_TOKEN` (same value as the GitHub secret)

3. Example GitHub Actions step (see `.github/workflows/device-provision.yml`):

```yaml
- name: Provision device (CI-only)
  env:
    CI_REGISTRATION_TOKEN: ${{ secrets.CI_REGISTRATION_TOKEN }}
    APP_URL: ${{ secrets.APP_URL }}
  run: |
    curl -s -X POST "$APP_URL/api/devices/register" \
      -H "Content-Type: application/json" \
      -H "x-ci-registration-token: $CI_REGISTRATION_TOKEN" \
      -d '{"displayName":"ci-provisioned"}' -o provision.json
    cat provision.json
```

4. Store the returned token securely

- The endpoint returns JSON with `token` and `device_secret` (raw secret is returned once).
- Store these values in a secure secrets manager if you need them for later automated jobs, or inject them into downstream deployments.

Notes
- `REGISTRATION_CI_ONLY` set to `true` forces the server to require the CI header token; if unset, the server will fall back to `ADMIN_PORTAL_PASSWORD` behavior when that is configured.
- Rotate `CI_REGISTRATION_TOKEN` periodically and update both CI secret and the server env. Ensure you have a fallback plan to re-provision.
