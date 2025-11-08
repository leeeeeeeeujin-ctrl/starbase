#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path/to/script.js> [timeout_seconds]"
  exit 2
fi

SCRIPT="$1"
TIMEOUT=${2:-5}

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for this sandbox PoC. Install Docker and try again." >&2
  exit 1
fi

ABS_SCRIPT=$(realpath "$SCRIPT")
SCRIPT_DIR=$(dirname "$ABS_SCRIPT")
SCRIPT_NAME=$(basename "$ABS_SCRIPT")
CONTAINER_NAME="sbx-$(date +%s)"

echo "Running sandbox for $ABS_SCRIPT (timeout ${TIMEOUT}s) in container ${CONTAINER_NAME}"

# Start container in background (docker run blocks; we background the process so we can enforce timeout)
docker run --rm --name "$CONTAINER_NAME" \
  -v "$SCRIPT_DIR":/host \
  --network none \
  --memory 128m \
  --cpus ".5" \
  --pids-limit 64 \
  node:18-bullseye \
  sh -c "node /host/$SCRIPT_NAME" &

DOCKER_PID=$!

# wait for timeout seconds and then kill container if still running
sleep "$TIMEOUT"

if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
  echo "Timeout reached (${TIMEOUT}s). Killing container ${CONTAINER_NAME}..."
  docker kill "$CONTAINER_NAME" || true
fi

# wait for docker run process to exit
wait $DOCKER_PID || true

echo "Sandbox run complete."
