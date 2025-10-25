@echo off
setlocal ENABLEDELAYEDEXPANSION

REM ============================================================================
REM  One-Click Admin Portal Launcher (Local Dev + Mock Game Backend)
REM  Date: 2025-10-21
REM  
REM  Usage: Double-click this file to start the dev server and open Admin Portal
REM  
REM  This script:
REM  - Auto-detects Node.js and npm
REM  - Installs dependencies if needed
REM  - Sets ADMIN_PORTAL_PASSWORD (default: localdev)
REM  - Starts Next.js dev server
REM  - Opens Admin Portal in your default browser
REM  
REM  Note: If an error occurs, the window will stay open for diagnosis
REM ============================================================================

echo.
echo ========================================
echo   Admin Portal Local Launcher
echo ========================================
echo.

REM Move to repo root (this script's directory)
pushd "%~dp0" || goto :error_exit

REM Path to the Next.js app within this repo
set "APP_DIR=ai-roomchat\starbase\ai-roomchat"

if not exist "%APP_DIR%\package.json" (
  echo.
  echo [ERROR] App directory not found!
  echo.
  echo Expected: %~dp0%APP_DIR%
  echo.
  echo Diagnosis:
  echo   Current directory: %CD%
  echo   Looking for: %APP_DIR%\package.json
  echo.
  echo This script must be placed in the repo root directory.
  echo.
  echo Directory contents:
  dir /b
  echo.
  goto :error_exit
)

echo [1/5] Checking Node.js and npm...

REM Try to find Node.js in common installation paths
set "NODE_FOUND=0"
set "NODE_CMD=node"
set "NPM_CMD=npm"

REM Check if node is already in PATH
where node >nul 2>nul
if not errorlevel 1 (
  set "NODE_FOUND=1"
  goto :node_check_done
)

REM Try common Node.js installation locations
if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE_CMD=%ProgramFiles%\nodejs\node.exe"
  set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
  set "NODE_FOUND=1"
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
  goto :node_check_done
)

if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
  set "NODE_CMD=%ProgramFiles(x86)%\nodejs\node.exe"
  set "NPM_CMD=%ProgramFiles(x86)%\nodejs\npm.cmd"
  set "NODE_FOUND=1"
  set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
  goto :node_check_done
)

if exist "%APPDATA%\nvm" (
  for /f "delims=" %%i in ('dir /b /ad "%APPDATA%\nvm\v*" 2^>nul') do (
    if exist "%APPDATA%\nvm\%%i\node.exe" (
      set "NODE_CMD=%APPDATA%\nvm\%%i\node.exe"
      set "NPM_CMD=%APPDATA%\nvm\%%i\npm.cmd"
      set "NODE_FOUND=1"
      set "PATH=%APPDATA%\nvm\%%i;%PATH%"
      goto :node_check_done
    )
  )
)

:node_check_done

if "%NODE_FOUND%"=="0" (
  echo.
  echo [ERROR] Node.js not found!
  echo.
  echo Diagnosis:
  echo   Checked the following locations:
  echo   [X] System PATH environment variable
  echo   [X] %ProgramFiles%\nodejs
  echo   [X] %ProgramFiles(x86)%\nodejs
  echo   [X] %APPDATA%\nvm (Node Version Manager)
  echo.
  echo Solution:
  echo   1. Install Node.js from: https://nodejs.org/
  echo   2. Recommended version: Node.js 18 LTS or newer
  echo   3. After installation, restart this script
  echo.
  echo Your current PATH:
  echo %PATH%
  echo.
  goto :error_exit
)

REM Verify npm is available
where npm >nul 2>nul
if errorlevel 1 (
  if not exist "%NPM_CMD%" (
    echo.
    echo [ERROR] npm not found!
    echo.
    echo Diagnosis:
    echo   Node.js is installed but npm is missing.
    echo   npm should come bundled with Node.js.
    echo.
    echo Solution:
    echo   Reinstall Node.js from: https://nodejs.org/
    echo   Make sure to check "npm package manager" during installation.
    echo.
    goto :error_exit
  )
)

REM Show versions
for /f "tokens=*" %%v in ('"%NODE_CMD%" --version 2^>nul') do set "NODE_VER=%%v"
for /f "tokens=*" %%v in ('"%NPM_CMD%" --version 2^>nul') do set "NPM_VER=%%v"

if not defined NODE_VER (
  echo.
  echo [ERROR] Cannot get Node.js version!
  echo.
  echo Diagnosis:
  echo   Node.js executable found at: %NODE_CMD%
  echo   But failed to run: node --version
  echo.
  echo Solution:
  echo   The Node.js installation may be corrupted.
  echo   Reinstall Node.js from: https://nodejs.org/
  echo.
  goto :error_exit
)

echo    Node.js: %NODE_VER%
echo    npm: %NPM_VER%
echo    [OK]
echo.

cd /d "%APP_DIR%"

echo [2/5] Checking dependencies...

cd /d "%APP_DIR%" || (
  echo.
  echo [ERROR] Cannot change to app directory!
  echo.
  echo Diagnosis:
  echo   Failed to cd to: %APP_DIR%
  echo   Current directory: %CD%
  echo.
  goto :error_exit
)

REM Install dependencies if missing
if not exist "node_modules" (
  echo    node_modules not found. Installing...
  echo    This may take a few minutes...
  echo.
  call npm ci
  if errorlevel 1 (
    echo.
    echo [ERROR] npm ci failed!
    echo.
    echo Diagnosis:
    echo   npm failed to install dependencies.
    echo   Error code: %ERRORLEVEL%
    echo   Directory: %CD%
    echo.
    echo Common solutions:
    echo   1. Check your internet connection
    echo   2. Delete package-lock.json and try again
    echo   3. Delete node_modules folder and try again
    echo   4. Run: npm cache clean --force
    echo.
    echo The error details are shown above.
    echo.
    goto :error_exit
  )
  echo.
  echo    [OK] Dependencies installed
) else (
  echo    [OK] Dependencies already installed
)
echo.

echo [3/5] Setting up Admin Portal password...

REM Default password for local admin portal if none is set
if not defined ADMIN_PORTAL_PASSWORD (
  set "ADMIN_PORTAL_PASSWORD=localdev"
  echo    Using default password: localdev
) else (
  echo    Using password from environment
)
echo    [OK]
echo.

echo [4/5] Starting Next.js dev server...
echo    Server will run in a new window
echo    Check that window for any errors!
echo.

REM Start Next.js dev server in a new window with ADMIN_PORTAL_PASSWORD set
set "_ADMINPW=%ADMIN_PORTAL_PASSWORD%"
echo    Current directory: %CD%
echo    Starting: npm run dev
echo.

start "ai-roomchat dev server - DO NOT CLOSE" cmd /k "cd /d "%CD%" && set ADMIN_PORTAL_PASSWORD=!_ADMINPW! && echo Starting dev server... && npm run dev"

REM Give the server time to start
echo [5/5] Waiting for server to start...
echo    This may take 10-30 seconds...
echo.

REM Wait and check if port 3000 is listening
set "SERVER_READY=0"
for /L %%i in (1,1,15) do (
  >nul 2>&1 powershell -Command "Test-NetConnection -ComputerName localhost -Port 3000 -InformationLevel Quiet"
  if not errorlevel 1 (
    set "SERVER_READY=1"
    goto :server_ready
  )
  echo    Checking... (%%i/15^)
  >nul timeout /t 2 /nobreak
)

:server_ready
if "%SERVER_READY%"=="0" (
  echo.
  echo [WARNING] Server might not be ready yet!
  echo.
  echo Diagnosis:
  echo   Port 3000 is not responding after 30 seconds.
  echo.
  echo Possible causes:
  echo   1. The dev server is still starting (may need more time)
  echo   2. Port 3000 is already in use by another process
  echo   3. An error occurred in the dev server window
  echo.
  echo Solution:
  echo   1. Check the "ai-roomchat dev server" window for errors
  echo   2. If no window appeared, run manually:
  echo      cd %CD%
  echo      set ADMIN_PORTAL_PASSWORD=localdev
  echo      npm run dev
  echo.
  echo Do you want to open the browser anyway? (Y/N^)
  choice /C YN /N /M "Press Y or N: "
  if errorlevel 2 goto :skip_browser
)

echo.
echo [OK] Opening Admin Portal in browser...

REM Open the Admin Portal
start "" "http://localhost:3000/admin/portal"

if errorlevel 1 (
  echo.
  echo [WARNING] Failed to open browser automatically.
  echo.
  echo Please manually open: http://localhost:3000/admin/portal
  echo.
)

:skip_browser
echo.
echo ========================================
echo   Launch Complete!
echo ========================================
echo.
echo  Admin Portal URL: http://localhost:3000/admin/portal
echo  Login Password: !_ADMINPW!
echo.
echo  The dev server is running in a separate window.
echo  Keep that window open while using the portal.
echo.
echo  Features available:
echo    - Title Background Editor
echo    - Announcement Manager
echo    - Matchmaking Log Monitor
echo    - Mock Game Simulator (NEW!)
echo.
echo  To stop: Close the "ai-roomchat dev server" window
echo           or press Ctrl+C in that window.
echo.
echo  If the browser didn't open automatically:
echo    Open your browser and go to: http://localhost:3000/admin/portal
echo.
echo ========================================

echo.
echo Press any key to close this window...
pause >nul

popd
endlocal
exit /b 0

:error_exit
REM This label is called when an error occurs
echo.
echo ========================================
echo   SCRIPT FAILED - See diagnosis above
echo ========================================
echo.
echo The window will remain open for diagnosis.
echo Press any key to exit...
pause >nul
popd
endlocal
exit /b 1
