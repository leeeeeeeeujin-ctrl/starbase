# Quick helper to try applying ai-roomchat/sql/*.sql using locally installed supabase CLI
Write-Host "[run_supabase_local] Starting..."

# Check for supabase CLI
if (Get-Command supabase -ErrorAction SilentlyContinue) {
    try {
        Write-Host "supabase CLI version:"
        supabase --version
    } catch {
        Write-Host "Failed to run 'supabase --version' (non-fatal): $_"
    }
} else {
    Write-Host "supabase CLI: not found in PATH"
    exit 2
}

# Check environment variables
$service = $env:SUPABASE_SERVICE_ROLE_KEY
$projectUrl = $env:SUPABASE_PROJECT_URL
$migrateDb = $env:MIGRATE_DATABASE_URL

if ($service) { Write-Host "SUPABASE_SERVICE_ROLE_KEY: set" } else { Write-Host "SUPABASE_SERVICE_ROLE_KEY: not set" }
if ($projectUrl) { Write-Host "SUPABASE_PROJECT_URL: set -> $projectUrl" } else { Write-Host "SUPABASE_PROJECT_URL: not set" }
if ($migrateDb) { Write-Host "MIGRATE_DATABASE_URL: set" } else { Write-Host "MIGRATE_DATABASE_URL: not set" }

if (-not $service -or -not $projectUrl) {
    Write-Host "Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_PROJECT_URL; cannot run supabase CLI path"
    exit 3
}

# extract project ref from project URL
if ($projectUrl -match 'https?://([^\.]+)') {
    $projRef = $matches[1]
    Write-Host "Project ref: $projRef"
} else {
    Write-Host "Failed to parse project ref from SUPABASE_PROJECT_URL: $projectUrl"
    exit 4
}

$sqlDir = "ai-roomchat/sql"
if (-not (Test-Path $sqlDir)) {
    Write-Host "SQL directory not found: $sqlDir"
    exit 5
}

$files = Get-ChildItem -Path $sqlDir -Filter *.sql | Sort-Object Name
if ($files.Count -eq 0) {
    Write-Host "No .sql files found in $sqlDir"
    exit 6
}

foreach ($f in $files) {
    Write-Host "---- Running: $($f.FullName) ----"
    # Use Get-Content -Raw to preserve file newlines; pipe content to supabase db query
    try {
        Get-Content $f.FullName -Raw | supabase db query --project-ref $projRef --service-role-key $service --yes
    } catch {
        Write-Host "supabase db query failed for $($f.Name): $_"
        exit 7
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "supabase db query exit code: $LASTEXITCODE for $($f.Name)"
        exit 8
    }
}

Write-Host "All SQL files applied successfully via supabase CLI"
exit 0
