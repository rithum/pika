#!/usr/bin/env bash
# Runs the Python unit tests for the Strands converse Lambda.
# Automatically sets up the venv if needed.
# Usage: ./scripts/test.sh [pytest args...]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAMBDA_DIR="$(dirname "$SCRIPT_DIR")"

cd "$LAMBDA_DIR"

# Bootstrap venv if missing
if [ ! -d ".venv" ]; then
    "$SCRIPT_DIR/setup.sh"
fi

source .venv/bin/activate
PYTHONPATH="$LAMBDA_DIR" pytest tests/ -v "$@"
