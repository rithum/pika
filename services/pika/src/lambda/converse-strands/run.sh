#!/bin/bash
# Bootstrap script for Lambda Web Adapter.
# Starts uvicorn serving the FastAPI app on the port the adapter expects.
# AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap intercepts execution and runs this
# as a shell script instead of importing it as a Python module.
export PATH="$PATH:$LAMBDA_TASK_ROOT/bin"
export PYTHONPATH="$PYTHONPATH:/opt/python:$LAMBDA_RUNTIME_DIR:$LAMBDA_TASK_ROOT"
exec python -m uvicorn app:app --host 0.0.0.0 --port "${PORT:-8080}" --workers 1
