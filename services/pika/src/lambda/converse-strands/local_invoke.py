#!/usr/bin/env python3
"""Local invocation harness for the Strands converse Lambda.

Usage:
    export CHAT_MESSAGES_TABLE=ai-bot-test-ChatMessagesTable
    export CHAT_SESSION_TABLE=ai-bot-test-ChatSessionTable
    export CHAT_USER_TABLE=ai-bot-test-ChatUserTable
    export STAGE=test

    python local_invoke.py "What orders are associated with account 12345?"
    python local_invoke.py  # Uses default message

Optional env vars:
    AGENT_ID            override the agent id (default: order-analyzer-2)
    USER_ID, ACCOUNT_ID override the user / account identity
    CHAT_APP_ID         override the chat app id (default: rithum-bot)
    MODE                set to "chat-app-component" to exercise embedded-widget
                        mode; reads COMPONENT_TAG_SCOPE, COMPONENT_TAG_NAME, and
                        COMPONENT_INSTRUCTION_NAME to build chatAppComponentConfig.
    INTENT_ROUTER=1     enables features.intentRouter.enabled for this request
                        (pair with CHAT_APP_ID=rcs to exercise live rcs commands).
    INSTRUCTION_ASSISTANCE=1
                        enables features.agentInstructionAssistance with all
                        four sub-flags on — mirrors what the frontend sends
                        by default. Needed to exercise the {{prompt-assistance}}
                        placeholder pipeline (e.g. against order-geo).

Example — component mode against the es2996_test/component_demo fixture:
    MODE=chat-app-component \\
    COMPONENT_TAG_SCOPE=es2996_test \\
    COMPONENT_TAG_NAME=component_demo \\
    COMPONENT_INSTRUCTION_NAME=embedded_widget \\
    pnpm strands:invoke "What is the weather in Boston?"

Example — intent router against the live rcs chat app:
    CHAT_APP_ID=rcs INTENT_ROUTER=1 pnpm strands:invoke "show me my jobs"
"""
import json
import sys
import os
import queue
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from handler import handler, _STREAM_DONE, _STREAM_HEADERS


class FakeContext:
    """Mimics the Lambda context object."""
    def get_remaining_time_in_millis(self):
        return 300000  # 5 minutes


def main():
    message = sys.argv[1] if len(sys.argv) > 1 else "Hello, can you help me?"
    agent_id = os.environ.get('AGENT_ID', 'order-analyzer-2')
    user_id = os.environ.get('USER_ID', '6881125b7daf26208e5c1bf1')
    account_id = os.environ.get('ACCOUNT_ID', '1000007583')

    chat_app_id = os.environ.get('CHAT_APP_ID', 'rithum-bot')
    request_body = {
        'agentId': agent_id,
        'userId': user_id,
        'sessionId': f"strands-test-{int(time.time())}",
        'message': message,
        'customUserData': {'accountId': account_id},
        'features': {
            'instructionAugmentation': {'enabled': True, 'type': 'llm-semantic-directive-search'},
            'verifyResponse': {'enabled': False},
        },
    }
    # Only include chatAppId when set — empty string / unset → direct-agent-invoke mode.
    if chat_app_id:
        request_body['chatAppId'] = chat_app_id

    if os.environ.get('INTENT_ROUTER'):
        request_body['features']['intentRouter'] = {
            'enabled': True,
            'confidenceThreshold': float(os.environ.get('IR_CONFIDENCE_THRESHOLD', '0.80')),
        }
        print(f"[intent router] enabled for chatAppId={chat_app_id} (threshold=0.80)")

    # INSTRUCTION_ASSISTANCE=1 mirrors the site-features default the frontend
    # sends in prod — enables the {{prompt-assistance}} placeholder pipeline
    # and all four sub-flags. Needed to validate any agent whose base_prompt
    # relies on placeholder-based injection (order-geo, weatherz-agent-prod).
    if os.environ.get('INSTRUCTION_ASSISTANCE'):
        request_body['features']['agentInstructionAssistance'] = {
            'enabled': True,
            'includeOutputFormattingRequirements': {'enabled': True},
            'includeInstructionsForTags': {'enabled': True},
            'completeExampleInstructionEnabled': {'enabled': True},
            'jsonOnlyImperativeInstructionEnabled': {'enabled': True},
        }
        print(f"[instruction assistance] enabled for chatAppId={chat_app_id}")

    # Opt-in chat-app-component mode via env vars
    mode = os.environ.get('MODE')
    if mode == 'chat-app-component':
        request_body['mode'] = mode
        request_body['chatAppComponentConfig'] = {
            'componentAgentInstructionName': os.environ.get('COMPONENT_INSTRUCTION_NAME', 'embedded_widget'),
            'componentTagDefinition': {
                'scope': os.environ.get('COMPONENT_TAG_SCOPE', 'es2996_test'),
                'tag': os.environ.get('COMPONENT_TAG_NAME', 'component_demo'),
            },
        }
        # Semantic directives are scoped per-agent; disable for component mode so
        # the override is the only prompt source under test.
        request_body['features']['instructionAugmentation'] = {'enabled': False}
        print(f"[component mode] tag={request_body['chatAppComponentConfig']['componentTagDefinition']} "
              f"instruction={request_body['chatAppComponentConfig']['componentAgentInstructionName']}")

    event = {
        'body': json.dumps(request_body),
    }

    chunk_queue = queue.Queue()

    thread = threading.Thread(
        target=handler,
        args=(event, FakeContext(), chunk_queue),
        daemon=True,
    )
    thread.start()

    # Print chunks as they arrive
    while True:
        chunk = chunk_queue.get()
        if chunk is _STREAM_DONE:
            break
        # Skip the headers sentinel tuple that the handler queues first
        if isinstance(chunk, tuple) and len(chunk) == 2 and chunk[0] is _STREAM_HEADERS:
            continue
        # Add newlines around trace/heartbeat/metadata tags for readability
        if chunk.startswith('<trace>') or chunk.startswith('<heartbeat') or chunk.startswith('<pika-metadata>'):
            print()
        print(chunk, end='', flush=True)

    print()  # Final newline


if __name__ == '__main__':
    main()
