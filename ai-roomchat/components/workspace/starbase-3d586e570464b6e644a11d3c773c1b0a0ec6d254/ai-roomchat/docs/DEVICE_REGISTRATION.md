# Device registration & usage

This document explains the device registration flow added to ai-roomchat for local/device-first runs.

## Register a device

POST /api/devices/register

Body (JSON):

{
  "deviceId": "optional-id",
  "displayName": "my-phone",
  "adminPassword": "..." // required only if ADMIN_PORTAL_PASSWORD is set in server env
}

Response:
- token: string (store this on the device)
- deviceId, displayName, exp (expiry unix seconds)

## Submit a run using the device token

When submitting a client-side run to `/api/prompts/:id/run`, include the device token in header:

- x-device-token: <token>

The server will verify the token and, if valid, persist the run.

## Revoke a device token

POST /api/devices/revoke

Body: { token: "<token>", adminPassword: "..." }

Requires `ADMIN_PORTAL_PASSWORD` when the server has it configured.

## Notes

- Current implementation uses a shared secret (`RUN_DEVICE_SECRET` or fallback) to sign tokens. For production, consider asymmetric device keys or OAuth flows.
- Tokens are stored in Supabase if configured, otherwise in-memory (not durable). Implement DB-backed storage for production.
 
## Database migration (Supabase/Postgres)

If you use Supabase or Postgres for persistence, apply the migration in `sql/002_add_devices_and_prompt_runs.sql` to create the `devices` table and add audit columns to `prompt_runs`.

Apply the SQL in your Supabase SQL editor or via psql against your database.
