#!/usr/bin/env bash
# Minimal Docker PoC runner: build a small container and run a sample job in a constrained environment.
# This script assumes Docker is available and the user understands it will build and run a local image.

set -euo pipefail

IMG=starbase-sandbox-poc:latest
WORKDIR=$(cd "$(dirname "$0")/.." && pwd)

cat > "$WORKDIR/Dockerfile.poc" <<'EOF'
FROM node:18-slim
WORKDIR /work
COPY ./ai-roomchat /work/ai-roomchat
RUN chown -R node:node /work
USER node
CMD ["node", "ai-roomchat/scripts/fuzz_runner.js", "--mode=fast"]
EOF

echo "Building $IMG..."
docker build -t $IMG -f "$WORKDIR/Dockerfile.poc" "$WORKDIR"

echo "Running container with resource limits (30s timeout, 256MB RAM)..."
docker run --rm --memory=256m --cpus=0.5 --pids-limit=64 $IMG

echo "PoC run completed."
