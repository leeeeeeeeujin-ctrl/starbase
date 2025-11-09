param(
  [Parameter(Mandatory=$true)]
  [string]$ScriptPath,
  [int]$TimeoutSeconds = 5
)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker is required for this sandbox PoC. Install Docker and try again."
  exit 1
}

$abs = Resolve-Path $ScriptPath
$dir = Split-Path $abs -Parent
$name = Split-Path $abs -Leaf
$containerName = "sbx-$(Get-Date -UFormat %s)"

Write-Host "Running sandbox for $abs (timeout ${TimeoutSeconds}s) in container $containerName"

$args = "run --rm --name $containerName -v `"$dir`":/host --network none --memory 128m --cpus 0.5 --pids-limit 64 node:18-bullseye sh -c `"node /host/$name`""

$proc = Start-Process -FilePath docker -ArgumentList $args -NoNewWindow -PassThru

if (-not (Wait-Process -Id $proc.Id -Timeout $TimeoutSeconds)) {
  Write-Host "Timeout reached ($TimeoutSeconds s). Attempting to stop container $containerName"
  try {
    docker kill $containerName | Out-Null
  } catch {
    Write-Warning "Failed to kill container: $_"
  }
}

try { Wait-Process -Id $proc.Id -ErrorAction SilentlyContinue } catch {}

Write-Host "Sandbox run complete."
