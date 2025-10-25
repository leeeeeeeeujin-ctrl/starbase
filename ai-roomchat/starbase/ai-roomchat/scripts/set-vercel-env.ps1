<#
  set-vercel-env.ps1

  Interactive helper to add environment variables to a Vercel project using
  a Vercel service token. This keeps secrets out of the repo. Do NOT paste
  tokens into public chat.

  Usage (PowerShell):
    .\scripts\set-vercel-env.ps1

  The script will prompt for a Vercel token and project name (or project ID).
  It sets these variables by default for the `preview` target. You can change
  target selection when prompted.

  Notes:
  - Create a Vercel Service Token at https://vercel.com/account/tokens (minimal
    privileges required: Project:Read and Project:Write / Environment Variables)
  - This script talks to the Vercel REST API. It does NOT store the token.
#>

function Read-Secret([string]$prompt) {
  Write-Host -NoNewline ($prompt + ': ')
  $pw = Read-Host -AsSecureString
  return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw))
}

Write-Host "This script will add environment variables to a Vercel project."

$token = Read-Host "Enter Vercel Service Token (or press Enter to use VERCEL_TOKEN env)"
if ([string]::IsNullOrWhiteSpace($token)) { $token = $env:VERCEL_TOKEN }
if ([string]::IsNullOrWhiteSpace($token)) {
  Write-Error "No Vercel token provided. Create one at https://vercel.com/account/tokens and try again."
  exit 1
}

$project = Read-Host "Enter Vercel project name or ID (e.g. my-project)"
if ([string]::IsNullOrWhiteSpace($project)) {
  Write-Error "Project name or ID required."
  exit 1
}

# Helper: POST env var
function Add-VercelEnv($proj, $key, $value, $targets) {
  $uri = "https://api.vercel.com/v9/projects/$proj/env"
  $body = @{ key = $key; value = $value; target = $targets; type = "encrypted" } | ConvertTo-Json
  try {
    # Assign to $null to avoid unused variable warnings
    $null = Invoke-RestMethod -Method Post -Uri $uri -Headers @{ Authorization = ("Bearer " + $token); 'Content-Type' = 'application/json' } -Body $body
    Write-Host ("Added {0} -> targets: {1}" -f $key, ($targets -join ','))
  } catch {
    Write-Warning ("Failed to add {0}: {1}" -f $key, ($_.Exception.Message))
    $_.Exception.Response | Out-String | Write-Debug
  }
}

$defaults = @(
  @{ name = 'ENABLE_TEST_ENDPOINT'; prompt='Enable test endpoint? (true/false)'; default='true' },
  @{ name = 'TEST_USER_EMAIL'; prompt='Test user email (leave blank to skip)'; default='' },
  @{ name = 'TEST_USER_PASSWORD'; prompt='Test user password (leave blank to skip)'; default='' },
  @{ name = 'SUPABASE_SERVICE_ROLE'; prompt='Supabase service role key (leave blank to skip)'; default='' }
)

foreach ($item in $defaults) {
  $val = Read-Host $item.prompt
  if ([string]::IsNullOrWhiteSpace($val) -and -not [string]::IsNullOrWhiteSpace($item.default)) { $val = $item.default }
  if ([string]::IsNullOrWhiteSpace($val)) { continue }

  $targetInput = Read-Host "Targets (comma-separated: production,preview,development). Default: preview"
  if ([string]::IsNullOrWhiteSpace($targetInput)) { $targets = @('preview') } else { $targets = $targetInput.Split(',') | ForEach-Object { $_.Trim() } }

  Add-VercelEnv -proj $project -key $item.name -value $val -targets $targets
}

Write-Host "Done. Verify in the Vercel dashboard or via 'vercel env ls --scope <team-or-user>'" -ForegroundColor Green
