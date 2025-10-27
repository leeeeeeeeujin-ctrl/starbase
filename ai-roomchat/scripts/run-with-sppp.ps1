<#
run-with-sppp.ps1

Usage (PowerShell, run locally in your environment):
.
# Example (default path):
.
# Example (explicit path):
.
# This script will:
# - Read your local SPPP file (dotenv-like or JSON) - it NEVER sends secrets anywhere.
# - Extract SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (supports several common keys)
# - Temporarily set environment variables for this PowerShell process
# - Run the existing Node runner `run-rpc-supabase.js`
# - Remove the temporary env vars after run
#
# SECURITY: The script does not commit, upload, or print sensitive values. It runs locally only.
#
# Supported SPPP formats:
# - dotenv-like (KEY=VALUE lines). Keys supported: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SERVICE_ROLE_KEY, SERVICE_ROLE
# - JSON object: { "SUPABASE_URL": "...", "SUPABASE_SERVICE_ROLE_KEY": "..." }
#>
param(
  [string]$SpppPath = "../SPPP",
  [string]$NodeRunner = "run-rpc-supabase.js"
)

function Parse-Dotenv($lines) {
  $map = @{}
  foreach ($line in $lines) {
    $trimmed = $line.Trim()
    if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
    $eq = $trimmed.IndexOf('=')
    if ($eq -lt 0) { continue }
    $k = $trimmed.Substring(0,$eq).Trim()
    # Extract value and remove surrounding single or double quotes if present
    $v = $trimmed.Substring($eq+1).Trim()
    if ($v.Length -ge 2) {
      if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
        $v = $v.Substring(1, $v.Length - 2)
      }
    }
    $map[$k] = $v
  }
  return $map
}

function Parse-Json($text) {
  try {
    return ConvertFrom-Json -InputObject $text -ErrorAction Stop
  } catch {
    return $null
  }
}

# Resolve path relative to script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$resolved = $null
if (Test-Path $SpppPath) { $resolved = (Resolve-Path $SpppPath).ProviderPath }
else {
  $candidate = Join-Path $scriptDir $SpppPath
  if (Test-Path $candidate) { $resolved = (Resolve-Path $candidate).ProviderPath }
}

if (-not $resolved) {
  Write-Host "SPPP file not found at '$SpppPath' or relative to script. Please provide correct path." -ForegroundColor Yellow
  exit 2
}

# Read file
$content = Get-Content -Raw -Path $resolved

# Try JSON first
$json = Parse-Json $content
$envMap = @{}
if ($json -ne $null) {
  # Convert PSCustomObject to hashtable
  foreach ($p in $json.psobject.Properties) { $envMap[$p.Name] = [string]$p.Value }
} else {
  $lines = $content -split "\r?\n"
  $map = Parse-Dotenv $lines
  foreach ($k in $map.Keys) { $envMap[$k] = $map[$k] }
}

# Heuristic: some SPPP files are just two lines (service-role-key then project URL) without key names.
if ($envMap.Count -eq 0) {
  $rawLines = ($content -split "\r?\n") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
  if ($rawLines.Count -ge 2) {
    # try to guess which line is URL vs key
    $line1 = $rawLines[0]
    $line2 = $rawLines[1]
    if ($line1 -match '^https?://') {
      $envMap['SUPABASE_URL'] = $line1
      $envMap['SUPABASE_SERVICE_ROLE_KEY'] = $line2
    } elseif ($line2 -match '^https?://') {
      $envMap['SUPABASE_SERVICE_ROLE_KEY'] = $line1
      $envMap['SUPABASE_URL'] = $line2
    }
  }
  # Diagnostic: report non-sensitive summary of raw lines when no keys found
  if ($envMap.Count -eq 0) {
    Write-Host "SPPP heuristic: non-empty lines = $($rawLines.Count)" -ForegroundColor Yellow
    for ($i=0; $i -lt $rawLines.Count; $i++) {
      $l = $rawLines[$i]
      $isUrl = ($l -match '^https?://')
      Write-Host "  line $($i+1): length=$($l.Length) isUrl=$isUrl" -ForegroundColor Yellow
    }
  }
}

# Heuristics: look for common key names
$possibleUrlKeys = @('SUPABASE_URL','SUPABASE_PROJECT_URL','DATABASE_URL','SUPABASE_URL')
$possibleKeyKeys = @('SUPABASE_SERVICE_ROLE_KEY','SERVICE_ROLE_KEY','SERVICE_ROLE','SERVICE_KEY')

$foundUrl = $null
$foundKey = $null

foreach ($k in $possibleUrlKeys) { if ($envMap.ContainsKey($k)) { $foundUrl = $envMap[$k]; break } }
foreach ($k in $possibleKeyKeys) { if ($envMap.ContainsKey($k)) { $foundKey = $envMap[$k]; break } }

if (-not $foundUrl -or -not $foundKey) {
  Write-Host "Could not find SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY automatically in SPPP file." -ForegroundColor Yellow
  Write-Host "Detected keys:" -NoNewline; Write-Host " " ($envMap.Keys -join ', ')
  Write-Host "You can still run the node script by exporting env vars manually." -ForegroundColor Yellow
  exit 3
}

# Set environment variables temporarily
$prev_SUPABASE_URL = [Environment]::GetEnvironmentVariable('SUPABASE_URL', 'Process')
$prev_SERVICE_KEY = [Environment]::GetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', 'Process')
[Environment]::SetEnvironmentVariable('SUPABASE_URL', $foundUrl, 'Process')
[Environment]::SetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', $foundKey, 'Process')

Write-Host "Running Node runner with SUPABASE_URL and service role key from local SPPP (values hidden)." -ForegroundColor Green
Write-Host "Node script: $NodeRunner" -ForegroundColor Cyan

# Run node script from scripts dir
Push-Location $scriptDir
try {
  # Ensure dependencies available
  if (-not (Test-Path node_modules -PathType Container)) {
    Write-Host "node_modules not found - installing @supabase/supabase-js and dotenv locally (may take a moment)..." -ForegroundColor Yellow
    npm install @supabase/supabase-js dotenv | Out-Null
  }

  # Execute node script
  $proc = Start-Process -FilePath node -ArgumentList $NodeRunner -NoNewWindow -Wait -PassThru
  if ($proc.ExitCode -ne 0) {
    Write-Host "Node process exited with code $($proc.ExitCode)" -ForegroundColor Red
  }
} finally {
  Pop-Location
  # Clear env vars (restore previous)
  if ($null -ne $prev_SUPABASE_URL) { [Environment]::SetEnvironmentVariable('SUPABASE_URL', $prev_SUPABASE_URL, 'Process') } else { [Environment]::SetEnvironmentVariable('SUPABASE_URL', $null, 'Process') }
  if ($null -ne $prev_SERVICE_KEY) { [Environment]::SetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', $prev_SERVICE_KEY, 'Process') } else { [Environment]::SetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', $null, 'Process') }
}

Write-Host "Done. Environment variables restored." -ForegroundColor Green
# end of script
