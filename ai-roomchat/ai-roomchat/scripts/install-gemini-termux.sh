#!/usr/bin/env bash
# install-gemini-termux.sh
# Usage: on Termux/Android, run:
#   ./install-gemini-termux.sh <DOWNLOAD_URL> [CHECKSUM]
# This script will download a Gemini CLI binary from the provided URL,
# verify an optional sha256 checksum, make it executable and place it under
# $HOME/.local/bin (created if missing). It will NOT attempt to fetch from
# any hardcoded remote source — you must provide the trusted URL.

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <DOWNLOAD_URL> [SHA256_CHECKSUM]"
  exit 2
fi

URL="$1"
CHECKSUM="${2:-}" 

DEST_DIR="$HOME/.local/bin"
TMPFILE="$(mktemp -t gemini.XXXX)
"
mkdir -p "$DEST_DIR"

echo "Downloading Gemini CLI from: $URL"
if command -v curl >/dev/null 2>&1; then
  curl -fSL "$URL" -o "$TMPFILE"
elif command -v wget >/dev/null 2>&1; then
  wget -O "$TMPFILE" "$URL"
else
  echo "Error: curl or wget required on device." >&2
  exit 3
fi

if [ -n "$CHECKSUM" ]; then
  echo "Verifying checksum..."
  if command -v sha256sum >/dev/null 2>&1; then
    echo "$CHECKSUM  $TMPFILE" | sha256sum -c -
  elif command -v shasum >/dev/null 2>&1; then
    echo "$CHECKSUM  $TMPFILE" | shasum -a 256 -c -
  else
    echo "Warning: no checksum tool (sha256sum/shasum) available; skipping verification." >&2
  fi
fi

FNAME="$(basename "$URL")"
CHOSEN="$DEST_DIR/$FNAME"
mv "$TMPFILE" "$CHOSEN"
chmod +x "$CHOSEN"

echo "Installed Gemini CLI to: $CHOSEN"
echo "Ensure this directory is in your PATH, e.g.:"
echo "  export PATH=\"$DEST_DIR:\$PATH\""

echo "Done. You can now run the mobile-runner and set GEMINI_CLI_PATH to $CHOSEN"
