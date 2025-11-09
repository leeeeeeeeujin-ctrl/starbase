param(
  [switch]$Insiders,
  [switch]$SetExecutionPolicy,
  [string]$ExtensionId = "ai-worker-pool"
)

# Paths
$codeDir = if ($Insiders) { Join-Path $env:APPDATA "Code - Insiders" } else { Join-Path $env:APPDATA "Code" }
$userDir = Join-Path $codeDir "User"
$settingsPath = Join-Path $userDir "settings.json"
$argvPath = Join-Path $userDir "argv.json"

# Ensure directories
if (!(Test-Path $userDir)) { New-Item -Path $userDir -ItemType Directory -Force | Out-Null }

function Read-Json($path) {
  if (Test-Path $path) {
    try { return Get-Content $path -Raw | ConvertFrom-Json -ErrorAction Stop } catch { return @{} }
  }
  return @{}
}

function Write-Json($obj, $path) {
  $backup = "$path.bak.$([DateTime]::Now.ToString('yyyyMMddHHmmss'))"
  if (Test-Path $path) { Copy-Item $path $backup -Force }
  $json = $obj | ConvertTo-Json -Depth 10 -Compress:$false
  Set-Content -Path $path -Value $json -Encoding UTF8
}

Write-Host "Configuring VS Code at: $codeDir" -ForegroundColor Cyan

# 1) settings.json tweaks (safe, reversible)
$settings = Read-Json $settingsPath
if (-not $settings) { $settings = @{} }

# Apply desired settings
$settings | Add-Member -NotePropertyName "security.workspace.trust.enabled" -NotePropertyValue $false -Force
$settings | Add-Member -NotePropertyName "security.workspace.trust.startupPrompt" -NotePropertyValue "never" -Force
$settings | Add-Member -NotePropertyName "extensions.autoUpdate" -NotePropertyValue $true -Force
$settings | Add-Member -NotePropertyName "extensions.autoCheckUpdates" -NotePropertyValue $true -Force
$settings | Add-Member -NotePropertyName "git.confirmSync" -NotePropertyValue $false -Force
$settings | Add-Member -NotePropertyName "window.confirmBeforeClose" -NotePropertyValue "never" -Force
$settings | Add-Member -NotePropertyName "terminal.integrated.confirmOnKill" -NotePropertyValue $false -Force
$settings | Add-Member -NotePropertyName "github.copilot.enable" -NotePropertyValue $true -Force
$settings | Add-Member -NotePropertyName "github.copilot.chat.enable" -NotePropertyValue $true -Force
$settings | Add-Member -NotePropertyName "workbench.colorTheme" -NotePropertyValue "Visual Studio Light" -Force

Write-Json $settings $settingsPath
Write-Host "✓ Updated settings.json" -ForegroundColor Green

# 2) argv.json for proposed API (works best on Insiders)
$argv = Read-Json $argvPath
if (-not $argv) { $argv = @{} }

$enable = @()
if ($argv."enable-proposed-api") {
  if ($argv."enable-proposed-api" -is [string]) { $enable = @($argv."enable-proposed-api") }
  elseif ($argv."enable-proposed-api" -is [System.Collections.IEnumerable]) { $enable = @($argv."enable-proposed-api") }
}

if ($ExtensionId -and -not ($enable -contains $ExtensionId)) { $enable += $ExtensionId }
$argv."enable-proposed-api" = $enable

Write-Json $argv $argvPath
Write-Host "✓ Updated argv.json (enable-proposed-api: $($enable -join ', '))" -ForegroundColor Green

# 3) Optional: PowerShell execution policy (reduces prompts for local scripts)
if ($SetExecutionPolicy) {
  try {
    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
    Write-Host "✓ Set PowerShell ExecutionPolicy to RemoteSigned (CurrentUser)" -ForegroundColor Green
  } catch {
    Write-Warning "Failed to set ExecutionPolicy. Try running PowerShell as Administrator."
  }
}

Write-Host "All done. Restart VS Code to apply argv.json changes." -ForegroundColor Cyan
