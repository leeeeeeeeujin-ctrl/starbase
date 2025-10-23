# VS Code Permissions - Auto Allow Toolkit

This doc explains safe ways to reduce or automate common permission prompts while using VS Code, GitHub Copilot, and our AI Worker Pool.

> Important: Prefer explicit, minimal permissions. If you choose to "allow all", do it knowingly and with backups.

## What can be safely automated

- Workspace Trust prompt → can be disabled
- Extension updates → auto-update
- Git sync confirms → disable
- Terminal/task confirm-on-kill → disable
- Proposed API for our extension → enable via argv.json
- PowerShell execution policy (CurrentUser) → RemoteSigned

## One-shot setup script (PowerShell)

Path: `scripts/vscode-auto-permit.ps1`

Run in PowerShell:

```powershell
# Standard VS Code
powershell -ExecutionPolicy Bypass -File scripts/vscode-auto-permit.ps1

# VS Code Insiders and also set ExecutionPolicy for current user
powershell -ExecutionPolicy Bypass -File scripts/vscode-auto-permit.ps1 -Insiders -SetExecutionPolicy
```

What it does:

- Trust all workspaces: `security.workspace.trust.enabled = false`
- Disable startup trust prompt
- Auto-update extensions
- Disable git confirmSync
- Disable confirm-before-close
- Disable terminal confirm-on-kill
- Enable Copilot + Copilot Chat
- Add our extension to `argv.json`'s `enable-proposed-api`

Backups:

- Creates timestamped backups of `settings.json` and `argv.json`

Restart VS Code to apply argv.json changes.

## Auto-clicking "Allow" (not recommended)

Path: `scripts/auto-allow.ahk` (AutoHotkey v1)

- Polls for VS Code/Electron dialogs and clicks common "Allow/Yes" buttons.
- Works for app-level prompts, NOT for Windows UAC secure desktop.
- Use at your own risk; may click unintended prompts.

Steps:

1. Install AutoHotkey (v1)
2. Run `scripts\auto-allow.ahk`
3. Customize button captions/window titles as needed

## Enterprise notes

- GitHub Copilot Enterprise lets org admins enforce and pre-configure policies.
- VS Code can be managed via:
  - Pre-seeded `%APPDATA%/Code/User/settings.json`
  - `argv.json` for proposed API flags
  - System management tools (Intune/Group Policy) to deploy config
- For CI/DevBoxes, bake these files into the base image.

## Revert changes

Use created backups:

- `%APPDATA%/Code/User/settings.json.bak.TIMESTAMP`
- `%APPDATA%/Code/User/argv.json.bak.TIMESTAMP`

Or manually edit the files to remove entries you've added.

## FAQ

- Q: Can we bypass all permissions globally?
  - A: No global kill switch. But for the common ones above, yes. OS-level prompts like UAC cannot be auto-clicked on the secure desktop.
- Q: Does proposed API work on Stable VS Code?
  - A: Only for development/testing scenarios. Prefer VS Code Insiders for consistent access.
- Q: Is this safe?
  - A: It's a trade-off. Use on trusted machines or VMs/sandboxes. Keep backups.
