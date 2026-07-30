"""
CONTRACT TESTS: the invocation-mode WIRE FIELD, asserted against the real client source.

Why this file exists — the bug it exists to prevent:
  The client sends `invocationMode`. This Lambda originally read only `mode`. So
  `invocationMode: 'chat-app-component'` fell through to the chatAppId branch and
  silently resolved to 'chat-app': component requests never received their tag-def
  system prompt, and widgets got unstructured prose instead of the JSON their
  instruction set was meant to produce. Nothing failed loudly.

  The existing mode tests did not catch it because THEY AUTHORED THEIR OWN INPUT —
  they hand-wrote `{'mode': ...}`, the very key the server happened to read. A test
  that invents its payload can only ever confirm the server agrees with the test.

  So these tests take the payload key from the CLIENT SOURCE ON DISK. If either side
  is renamed, they fail. That is the point: this guards a cross-language boundary
  (TypeScript client → Python Lambda) that no shared type can enforce, since the two
  runtimes share no type system.

Sources of truth read here:
  - apps/pika-chat/src/lib/client/features/chat/chat-app.state.svelte.ts
      the invokeAgentAsComponent() call site that builds the ConverseRequest
  - packages/shared/src/types/chatbot/chatbot-types.ts
      the ConverseRequest interface declaring the field
"""

import re
from pathlib import Path

import pytest

from invocation_mode import (CHAT_APP, CHAT_APP_COMPONENT, DIRECT_AGENT_INVOKE,
                             MODE_KEYS, determine_mode)

# tests/ → converse-strands → lambda → src → pika → services → <repo root>
REPO_ROOT = Path(__file__).resolve().parents[6]

CLIENT_STATE = REPO_ROOT / 'apps/pika-chat/src/lib/client/features/chat/chat-app.state.svelte.ts'
SHARED_TYPES = REPO_ROOT / 'packages/shared/src/types/chatbot/chatbot-types.ts'


def _read(path: Path) -> str:
    if not path.exists():
        pytest.skip(
            f'client source not present at {path} — this cross-boundary contract test '
            f'only runs from a full repo checkout, not a packaged Lambda bundle'
        )
    return path.read_text(encoding='utf-8')


def _invoke_agent_as_component_body() -> str:
    """Return the source text of the client's invokeAgentAsComponent() method."""
    src = _read(CLIENT_STATE)
    start = src.find('async invokeAgentAsComponent')
    assert start != -1, (
        'could not find invokeAgentAsComponent in the client state source; if it was '
        'renamed or moved, update this test — do NOT delete it'
    )
    # The ConverseRequest literal is built at the top of the method; a generous window
    # covers it without depending on exact formatting.
    return src[start:start + 2000]


def client_mode_key() -> str:
    """The request key the CLIENT actually uses to declare chat-app-component mode.

    Extracted from the client source, never hand-written.
    """
    body = _invoke_agent_as_component_body()
    match = re.search(r"(\w+)\s*:\s*'chat-app-component'", body)
    assert match, (
        "could not find a key assigned 'chat-app-component' in invokeAgentAsComponent; "
        f'searched:\n{body[:600]}'
    )
    return match.group(1)


def _converse_request_interface_block() -> str:
    """Return the source text of the `ConverseRequest` interface body only.

    `invocationMode` is declared on six interfaces in chatbot-types.ts (ChatSession,
    ChatMessage, ConverseRequest, SessionSearchRequest, SessionAnalyticsRequest,
    SessionAnalyticsCostByMode). Searching the whole file for the field would pass
    vacuously if it were renamed on ConverseRequest alone and left on the others — the
    contract this test exists to guard is specifically that ConverseRequest declares
    what the client sends. Brace-counted so nested `{...}` in a future property
    doesn't truncate the block early.
    """
    src = _read(SHARED_TYPES)
    match = re.search(r'export interface ConverseRequest\b[^{]*\{', src)
    assert match, (
        'could not find "export interface ConverseRequest" in chatbot-types.ts; if it '
        'was renamed or restructured, update this test — do NOT delete it'
    )
    depth = 0
    i = match.end() - 1  # index of the interface's opening brace
    while i < len(src):
        if src[i] == '{':
            depth += 1
        elif src[i] == '}':
            depth -= 1
            if depth == 0:
                return src[match.start():i + 1]
        i += 1
    raise AssertionError('unbalanced braces while scanning the ConverseRequest interface body')


class TestClientServerAgreeOnTheModeField:
    """The server must honor the key the client actually sends."""

    def test_client_mode_key_is_one_the_server_reads(self):
        key = client_mode_key()
        assert key in MODE_KEYS, (
            f'the client declares invocation mode under {key!r}, but this Lambda only '
            f'reads {MODE_KEYS!r}. That mismatch resolves component requests to '
            f"'chat-app' SILENTLY."
        )

    def test_client_payload_resolves_to_component_mode(self):
        """The decisive assertion: build the payload the way the CLIENT does.

        chatAppId is included because the client sends it, and its presence is exactly
        what made the original bug silent — it gave determine_mode a plausible wrong
        answer instead of no answer.
        """
        body = {
            client_mode_key(): 'chat-app-component',
            'chatAppId': 'rcs',
            'agentId': 'a-1',
            'userId': 'u-1',
            'message': 'answer the question',
        }

        assert determine_mode(body) == CHAT_APP_COMPONENT, (
            'a payload shaped like the real client request did not resolve to '
            'chat-app-component'
        )

    def test_shared_type_declares_the_same_field(self):
        """ConverseRequest specifically — not just some interface in the file — must
        declare the field the server reads.
        """
        interface_block = _converse_request_interface_block()
        key = client_mode_key()
        assert re.search(rf'\b{re.escape(key)}\??\s*:', interface_block), (
            f'{key!r} is sent by the client but is not declared on the ConverseRequest '
            f'interface in chatbot-types.ts'
        )


class TestAliasAndFallbackBehavior:
    """`mode` stays supported; precedence and inference are unchanged."""

    def test_legacy_mode_alias_still_works(self):
        """local_invoke.py and existing callers pass `mode` — must not break."""
        assert determine_mode({'mode': 'chat-app-component', 'chatAppId': 'rcs'}) == CHAT_APP_COMPONENT

    def test_invocation_mode_wins_over_alias(self):
        body = {'invocationMode': CHAT_APP_COMPONENT, 'mode': DIRECT_AGENT_INVOKE, 'chatAppId': 'rcs'}
        assert determine_mode(body) == CHAT_APP_COMPONENT, (
            'invocationMode is the real wire contract and must take precedence'
        )

    def test_blank_explicit_mode_falls_through_to_inference(self):
        assert determine_mode({'invocationMode': '', 'chatAppId': 'rcs'}) == CHAT_APP
        assert determine_mode({'invocationMode': '', 'mode': '', 'agentId': 'a'}) == DIRECT_AGENT_INVOKE

    def test_blank_wire_key_yields_to_populated_alias(self):
        """A blank invocationMode must not shadow a populated `mode` alias."""
        assert determine_mode({'invocationMode': '', 'mode': CHAT_APP_COMPONENT, 'chatAppId': 'rcs'}) == CHAT_APP_COMPONENT

    def test_inference_unchanged_when_no_explicit_mode(self):
        assert determine_mode({'chatAppId': 'rcs'}) == CHAT_APP
        assert determine_mode({'agentId': 'a'}) == DIRECT_AGENT_INVOKE

    def test_invalid_explicit_mode_is_returned_verbatim(self):
        """Validation is a separate step; determine_mode must not sanitize."""
        assert determine_mode({'invocationMode': 'not-a-real-mode'}) == 'not-a-real-mode'


class TestComponentRequestReachesItsValidation:
    """With the field read correctly, the component path actually engages."""

    def test_real_client_payload_passes_component_validation(self):
        from chat_app_component import (CHAT_APP_COMPONENT_MODE,
                                        validate_chat_app_component_request)

        body = {
            client_mode_key(): 'chat-app-component',
            'chatAppId': 'rcs',
            'agentId': 'a-1',
            'userId': 'u-1',
            'message': 'answer the question',
            'chatAppComponentConfig': {
                'componentAgentInstructionName': 'answer-question',
                'componentTagDefinition': {'scope': 'harmonizer', 'tag': 'question-card'},
            },
        }

        assert determine_mode(body) == CHAT_APP_COMPONENT_MODE
        assert validate_chat_app_component_request(body) is None

    def test_component_payload_missing_config_is_rejected(self):
        """The 400 path is only reachable once the mode resolves — pin that too."""
        from chat_app_component import validate_chat_app_component_request

        body = {client_mode_key(): 'chat-app-component', 'chatAppId': 'rcs',
                'agentId': 'a-1', 'userId': 'u-1'}

        assert determine_mode(body) == CHAT_APP_COMPONENT
        assert validate_chat_app_component_request(body) is not None
