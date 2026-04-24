#!/usr/bin/env bash
# Invokes the Strands Lambda handler locally against real AWS resources.
# Requires VPN + valid AWS credentials.
# Usage: ./scripts/local-invoke.sh ["Your message here"]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAMBDA_DIR="$(dirname "$SCRIPT_DIR")"

cd "$LAMBDA_DIR"

# Bootstrap venv if missing
if [ ! -d ".venv" ]; then
    "$SCRIPT_DIR/setup.sh"
fi

source .venv/bin/activate

# Table names follow the CDK naming convention: {table-prefix}-ai-bot-{stage}
export STAGE="${STAGE:-test}"
STACK_NAME="ai-bot-${STAGE}"
echo "Using stage: $STAGE"

if [ -z "${CHAT_MESSAGES_TABLE:-}" ]; then
    # Try SSM first (uses actual param paths from CDK), fall back to naming convention
    export CHAT_MESSAGES_TABLE=$(aws ssm get-parameter --name "/stack/ai-bot/$STAGE/ddb_table/chat_message" --query "Parameter.Value" --output text 2>/dev/null || echo "chat-message-${STACK_NAME}")
    export CHAT_SESSION_TABLE="${CHAT_SESSION_TABLE:-chat-session-${STACK_NAME}}"
    export CHAT_USER_TABLE="${CHAT_USER_TABLE:-chat-user-${STACK_NAME}}"
    export AGENT_DEFINITIONS_TABLE="${AGENT_DEFINITIONS_TABLE:-agent-definitions-${STACK_NAME}}"
    export TOOL_DEFINITIONS_TABLE="${TOOL_DEFINITIONS_TABLE:-tool-definitions-${STACK_NAME}}"
    export TAG_DEFINITIONS_TABLE="${TAG_DEFINITIONS_TABLE:-pika-tag-def-${STACK_NAME}}"
    export SEMANTIC_DIRECTIVE_TABLE="${SEMANTIC_DIRECTIVE_TABLE:-semantic-directive-${STACK_NAME}}"

    # Verify tables are reachable
    if ! aws dynamodb describe-table --table-name "$CHAT_MESSAGES_TABLE" --query "Table.TableName" --output text >/dev/null 2>&1; then
        echo "ERROR: Cannot reach DynamoDB table '$CHAT_MESSAGES_TABLE'."
        echo "  Are you on VPN with valid AWS creds?"
        echo "  Try: aws sts get-caller-identity"
        exit 1
    fi
    echo "Tables: messages=$CHAT_MESSAGES_TABLE session=$CHAT_SESSION_TABLE user=$CHAT_USER_TABLE"
    echo "        agents=$AGENT_DEFINITIONS_TABLE tools=$TOOL_DEFINITIONS_TABLE"
fi

MESSAGE="${1:-Hello, what can you help me with?}"
PYTHONPATH="$LAMBDA_DIR" python local_invoke.py "$MESSAGE"
