<#
run-finalize-test.ps1

Usage examples (PowerShell):
# run the SQL to create/replace the function and then call it against a session id
.\run-finalize-test.ps1 -PgHost "db.example.com" -PgPort 5432 -PgUser "dbuser" -PgPassword "secret" -PgDatabase "dbname" -SessionId "00000000-0000-0000-0000-000000000000"

If your SQL file is in a different path, pass -SqlFilePath.

Notes:
- This script invokes psql and expects it to be installed and on PATH.
- p_session_id must exist in public.rank_sessions, otherwise the function will raise session_not_found.
- To avoid FK issues for p_game_id, this script calls the function with p_game_id = NULL.
- Use responsibly: you are running DDL/DML against your DB.
#>
param(
  [Parameter(Mandatory=$true)][string]$PgHost,
  [int]$PgPort = 5432,
  [Parameter(Mandatory=$true)][string]$PgUser,
  [Parameter(Mandatory=$true)][string]$PgPassword,
  [Parameter(Mandatory=$true)][string]$PgDatabase,
  [Parameter(Mandatory=$true)][string]$SessionId,
  [string]$SqlFilePath = "./docs/sql/finalize-rank-session-outcome-channel-aware.sql"
)

function Run-PsqlFile {
  param($FilePath)
  Write-Host "Executing SQL file: $FilePath"
  $env:PGPASSWORD = $PgPassword
  $cmd = "psql -h $PgHost -p $PgPort -U $PgUser -d $PgDatabase -f \"$FilePath\""
  Write-Host $cmd
  & psql -h $PgHost -p $PgPort -U $PgUser -d $PgDatabase -f $FilePath
  if ($LASTEXITCODE -ne 0) { Write-Host "psql returned exit code $LASTEXITCODE"; Remove-Variable -Name env:PGPASSWORD -ErrorAction SilentlyContinue; exit $LASTEXITCODE }
  Remove-Variable -Name env:PGPASSWORD -ErrorAction SilentlyContinue
}

function Run-TestCall {
  param($SessionId)
  Write-Host "Calling finalize_rank_session_outcome for session $SessionId"
  $call_sql = @"
SELECT public.finalize_rank_session_outcome(
  '$SessionId'::uuid,
  NULL,
  '[
    {"participant_id": null, "channel": null, "slot_index": 0},
    {"participant_id": null, "channel": "", "slot_index": 1},
    {"participant_id": null, "channel": "attacker", "slot_index": 2},
    {"participant_id": null, "channel": "defender", "slot_index": 3}
  ]'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb
) as finalize_result;

SELECT id, created_at, payload->'channels' AS channels
FROM public.rank_session_battle_logs
WHERE session_id = '$SessionId'::uuid
ORDER BY created_at DESC
LIMIT 1;
"@

  $env:PGPASSWORD = $PgPassword
  # Use psql -c with the SQL containing newlines; pass it via a here-string file to avoid quoting issues
  $tmpFile = [System.IO.Path]::GetTempFileName() + ".sql"
  Set-Content -Path $tmpFile -Value $call_sql -Encoding UTF8
  try {
    & psql -h $PgHost -p $PgPort -U $PgUser -d $PgDatabase -f $tmpFile
    if ($LASTEXITCODE -ne 0) { Write-Host "psql returned exit code $LASTEXITCODE during test call"; exit $LASTEXITCODE }
  } finally {
    Remove-Item -Path $tmpFile -ErrorAction SilentlyContinue
    Remove-Variable -Name env:PGPASSWORD -ErrorAction SilentlyContinue
  }
}

# Ensure psql is available
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  Write-Host "psql not found on PATH. Install the PostgreSQL client tools or add psql to PATH."; exit 2
}

# Resolve SQL file path relative to script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$resolvedSqlFile = (Resolve-Path -Path (Join-Path $scriptDir $SqlFilePath) -ErrorAction SilentlyContinue)
if (-not $resolvedSqlFile) {
  # try as absolute
  if (Test-Path $SqlFilePath) { $resolvedSqlFile = (Resolve-Path -Path $SqlFilePath) } else { Write-Host "Cannot find SQL file: $SqlFilePath"; exit 3 }
}

Run-PsqlFile -FilePath $resolvedSqlFile
Run-TestCall -SessionId $SessionId

Write-Host "Done. Check the output above for results."
