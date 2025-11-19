@echo off
setlocal ENABLEDELAYEDEXPANSION

REM Launcher/installer for ui-sandbox-agent on Windows.
REM - Double-click to install dependencies (npm + Playwright browser) if needed
REM   and then start the agent.

cd /d "%~dp0ui-sandbox-agent"

REM Check for Node.js (prefer direct version check over `where` for compatibility)
node -v >nul 2>&1
if errorlevel 1 (
  echo [ui-sandbox-agent] Node.js is not installed or not on PATH.
  echo   1. Install Node.js LTS from https://nodejs.org/
  echo   2. Re-run this script.
  pause
  goto :eof
)

REM Check for npm
npm -v >nul 2>&1
if errorlevel 1 (
  echo [ui-sandbox-agent] npm was not found.
  echo   Please ensure Node.js was installed with npm support.
  pause
  goto :eof
)

REM Install node_modules if missing
if not exist "node_modules" (
  echo [ui-sandbox-agent] Installing npm dependencies...
  call npm install
  if errorlevel 1 (
    echo [ui-sandbox-agent] npm install failed. Check the log above.
    pause
    goto :eof
  )
)

REM Install Playwright browser binaries once
if not exist ".playwright-installed" (
  echo [ui-sandbox-agent] Installing Playwright browser binaries (chromium)...
  REM npx is part of Node.js; use it to install playwright browsers.
  call npx playwright install chromium
  if errorlevel 1 (
    echo [ui-sandbox-agent] Playwright browser installation failed.
    pause
    goto :eof
  )
  > ".playwright-installed" echo installed
)

set UI_SANDBOX_AGENT_PORT=7010
echo [ui-sandbox-agent] starting on http://127.0.0.1:%UI_SANDBOX_AGENT_PORT%
node server.mjs

endlocal
