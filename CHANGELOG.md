# Changelog

All notable changes to this repository are documented in this file.

## 2025-10-23 — Test stabilization & security updates

- Bumped `next` from 14.2.5 to 14.2.33 to address multiple security advisories (including a critical authorization bypass advisory).
- Bumped `@supabase/supabase-js` to 2.76.1 to pick up fixes for `@supabase/auth-js` transitive issues.
- Added `AGENT_PLAYBOOK.md` and `PR_SUMMARY_copilot_vscode1761193656515.md` to document agent workflows and the recent change summary.
- Suppressed noisy debug logging in test environments and hardened test setup to avoid test-injected global issues.
- Added GitHub Actions workflow `ci-jest.yml` to run Jest on PRs and pushes.

Notes:
- These changes were applied to stabilize unit tests and remove known vulnerable package versions. Please review the changelog before production deployments.
