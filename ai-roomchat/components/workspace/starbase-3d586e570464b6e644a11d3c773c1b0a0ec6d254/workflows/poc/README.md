# Sandbox PoC (Docker)

This folder contains a minimal Docker PoC to run a constrained job for testing sandboxing behavior.

Files
- `docker_run_poc.sh`: build and run a PoC image that executes `ai-roomchat/scripts/fuzz_runner.js` inside a container.

How to run (Linux/macOS; Windows WSL recommended):
```bash
cd workflows/poc
./docker_run_poc.sh
```

Notes
- The script is intentionally minimal. For production, replace with a more secure runtime (gVisor, Firecracker, or dedicated sandboxing) and avoid mounting host secrets.
