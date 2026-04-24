#!/usr/bin/env bash
# Sets up the Python virtual environment and installs dependencies for the Strands converse Lambda.
# Usage: ./scripts/setup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAMBDA_DIR="$(dirname "$SCRIPT_DIR")"

cd "$LAMBDA_DIR"

if [ ! -d ".venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv .venv
else
    echo "Virtual environment already exists."
fi

echo "Installing dependencies..."
source .venv/bin/activate
pip install -q -r requirements-dev.txt

echo ""
echo "Setup complete. To activate manually:"
echo "  source $LAMBDA_DIR/.venv/bin/activate"
