$ErrorActionPreference = 'Stop'

Write-Output "Applying channel-aware finalize RPC to local DB"

if (-not $env:PGHOST) {
  Write-Error "Please set PGHOST environment variable (db host)"
  exit 1
}

if (-not $env:PGUSER) {
  Write-Error "Please set PGUSER environment variable (db user)"
  exit 1
}

if (-not $env:PGDATABASE) {
  Write-Error "Please set PGDATABASE environment variable (db name)"
  exit 1
}

if (-not $env:PGPASSWORD) {
  Write-Output "Warning: PGPASSWORD not set. psql may prompt for password."
}

$sqlFile = Join-Path $PSScriptRoot "finalize-rank-session-outcome-channel-aware.sql"
$port = $env:PGPORT
if (-not $port) { $port = '5432' }

Write-Output "Running psql -f $sqlFile against $($env:PGHOST)/$($env:PGDATABASE) as $($env:PGUSER) on port $port"

& psql -h $env:PGHOST -p $port -U $env:PGUSER -d $env:PGDATABASE -f $sqlFile

if ($LASTEXITCODE -eq 0) {
  Write-Output "SQL applied successfully."
} else {
  Write-Error "psql exited with code $LASTEXITCODE"
}
