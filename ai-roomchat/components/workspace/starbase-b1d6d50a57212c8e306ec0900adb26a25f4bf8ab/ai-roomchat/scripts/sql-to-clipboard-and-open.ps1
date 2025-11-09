<#
sql-to-clipboard-and-open.ps1

Reads a SQL file (default: docs/sql/finalize-rank-session-outcome-channel-aware.sql), copies it to the Windows clipboard,
and opens the provided SQL editor URL in the default browser.

Usage (PowerShell):
.
# Simple (uses default file and prompts for URL):
.
.
# Example (open Supabase SQL editor URL):
.
.
Parameters:
-SqlFilePath: path to SQL file (relative to repo root or absolute). Default: ./docs/sql/finalize-rank-session-outcome-channel-aware.sql
-Url: URL to open (e.g. Supabase SQL editor). If omitted the script will prompt for it.

Security model: The script only runs locally when you execute it. It copies the SQL content to your clipboard and opens a URL; it does not transmit secrets or execute any remote actions.
#>

param(
  [string]$SqlFilePath = "./docs/sql/finalize-rank-session-outcome-channel-aware.sql",
  [string]$Url
)

function Resolve-ProjectPath([string]$path) {
  if (Test-Path $path) { return (Resolve-Path $path).ProviderPath }
  # try relative to script directory
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
  $candidate = Join-Path $scriptDir $path
  if (Test-Path $candidate) { return (Resolve-Path $candidate).ProviderPath }
  throw "SQL file not found: $path"
}

try {
  $resolved = Resolve-ProjectPath $SqlFilePath
} catch {
  Write-Error $_.Exception.Message
  exit 2
}

$content = Get-Content -Raw -Path $resolved -ErrorAction Stop

# Copy to clipboard
try {
  Set-Clipboard -Value $content -ErrorAction Stop
  Write-Host "SQL copied to clipboard from: $resolved"
} catch {
  Write-Warning "Failed to copy to clipboard. You can open the SQL file directly: $resolved"
}

if (-not $Url) {
  $Url = Read-Host "Enter SQL editor URL to open (e.g. https://app.supabase.com/project/PROJECT_ID/sql)"
}

if (-not $Url) { Write-Host "No URL provided. Exiting."; exit 0 }

Write-Host "Opening: $Url"
Start-Process $Url

Write-Host "When the SQL editor is open, paste (Ctrl+V) into the editor and run the SQL."
Write-Host "If you want an automated bookmarklet that attempts to paste into a textarea, see README in scripts/"

exit 0
