"""Contract tests: conversation history replay for the Strands converse Lambda.

# CONTRACT TESTS — THESE TESTS DEFINE EXPECTED BEHAVIOR, NOT CURRENT BEHAVIOR.
# They are expected to FAIL until conversation history is implemented in handler.py.
#
# Spec source: history-researcher findings (task #2), cross-referenced with:
#   - TypeScript path: services/pika/src/lambda/converse/index.ts
#   - Strands SDK: .venv/lib/python3.14/site-packages/strands/agent/agent.py
#
# Implementation requirements implied by these tests:
#
#   1. Import get_messages from chat_ddb in handler.py
#   2. Before constructing Agent(), call get_messages(dynamodb, CHAT_MESSAGES_TABLE, user_id, session_id)
#      NOTE: Unlike the TypeScript path (which only loads history on session expiry after 9 min),
#      the Strands path has no native Bedrock session state, so history must be loaded on EVERY turn.
#   3. Repair consecutive same-role turns via fix_turn_taking_errors() (mirrors TS fixTurnTakingErrors):
#      - Two consecutive 'user' messages → insert synthetic assistant: {"role": "assistant", "content": [{"text": "Error in conversation flow"}]}
#      - Two consecutive 'assistant' messages → insert synthetic user with the same filler text
#      - Repair runs BEFORE the DDB messages are converted to Strands format
#   4. Convert repaired messages to Strands format:
#          {"role": msg["source"], "content": [{"text": msg["message"]}]}
#      (DDB source values 'user'/'assistant' map directly to Strands roles)
#   5. Pass the converted list as the `messages` kwarg to Agent() constructor
#
# Strands SDK ref: Agent(messages=[...]) — constructor accepts prior conversation
#   history as Messages (list of {"role": str, "content": list[ContentBlock]}).
#   __call__ does NOT accept messages; history is managed internally between calls.
#   Source: .venv/lib/python3.14/site-packages/strands/agent/agent.py, line 120+213.
#
# DDB query pattern: get_messages() uses begins_with(message_id, '{sessionId}:')
#   which returns messages sorted by SK (message_id = {sessionId}:{timestamp}),
#   giving chronological order for free. No ScanIndexForward needed.
"""
import json
import re
import pytest
from unittest.mock import patch, MagicMock, call


# ---------------------------------------------------------------------------
# Helpers shared by this module
# ---------------------------------------------------------------------------

MOCK_AGENT_DEF = {
    'agent_id': 'test-agent-001',
    'base_prompt': 'You are a test assistant.',
    'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'tool_ids': [],
}


def _make_ddb_message(session_id: str, timestamp: int, source: str, text: str) -> dict:
    """Build a DDB message item in the schema used by chat_ddb.py."""
    return {
        'user_id': 'test-user-001',
        'session_id': session_id,
        'message_id': f'{session_id}:{timestamp}',
        'message': text,
        'source': source,
        'timestamp': timestamp,
    }


def _parse_pika_metadata(body: str) -> dict:
    match = re.search(r'<pika-metadata>(.*?)</pika-metadata>', body, re.DOTALL)
    if not match:
        raise AssertionError(f'No <pika-metadata> tag in body: {body!r}')
    return json.loads(match.group(1))


def _base_patches(mock_messages: list[dict]):
    """Return the standard set of patches for handler tests.

    mock_messages is what DDB will return for get_messages() queries.
    """
    return (
        patch('handler.dynamodb'),
        patch('handler.Agent'),
        patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
        patch('handler.load_tools', return_value=[]),
        patch('handler.build_strands_tools', return_value=[]),
        # CONTRACT: handler must import and call get_messages from chat_ddb
        patch('handler.get_messages', return_value=mock_messages),
    )


def _setup_ddb_mock(mock_ddb):
    """Configure the DDB resource mock for standard session/user lookups."""
    mock_table = MagicMock()
    mock_ddb.Table.return_value = mock_table
    # Session table: session exists
    mock_table.get_item.return_value = {
        'Item': {'user_id': 'test-user-001', 'session_id': 'test-session-001'}
    }
    return mock_table


def _make_agent_instance(mock_agent_cls, reply: str = 'Agent reply.'):
    """Configure MockAgent to return a usable instance."""
    instance = MagicMock()
    instance.return_value = reply
    mock_agent_cls.return_value = instance
    return instance


# ---------------------------------------------------------------------------
# Test 1: First message in a new session — Agent called with no prior history
#
# CONTRACT: When the session has no prior messages (new conversation), Agent()
# must still succeed. It should be called with messages=[] (or no messages kwarg),
# meaning no history is injected.
# ---------------------------------------------------------------------------

class TestFirstMessageNewSession:

    def test_agent_called_with_empty_messages_for_new_session(self, valid_event, fake_context):
        """CONTRACT: New session → Agent receives empty conversation history."""
        # No prior messages in DDB for this session
        p1, p2, p3, p4, p5, p6 = _base_patches(mock_messages=[])
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5, p6 as mock_get_messages:
            _setup_ddb_mock(mock_ddb)
            _make_agent_instance(MockAgent)

            from handler import handler
            result = handler(valid_event, fake_context)

            assert result['statusCode'] == 200

            # CONTRACT: get_messages must be called to check for history
            mock_get_messages.assert_called_once()
            call_args = mock_get_messages.call_args
            assert call_args.args[2] == 'test-user-001'  # user_id
            assert call_args.args[3] == 'test-session-001'  # session_id

            # CONTRACT: Agent must be constructed with messages=[] (empty history)
            MockAgent.assert_called_once()
            agent_kwargs = MockAgent.call_args.kwargs
            assert 'messages' in agent_kwargs, (
                "Agent() must receive a 'messages' kwarg — even empty — so history "
                "replay works consistently. Currently missing from handler.py."
            )
            assert agent_kwargs['messages'] == [], (
                f"New session should pass messages=[], got: {agent_kwargs['messages']}"
            )


# ---------------------------------------------------------------------------
# Test 2: Second message in existing session — prior messages loaded from DDB
# and passed to Agent
#
# CONTRACT: When the session has prior messages, get_messages() must be called
# and the returned messages must be converted and passed to Agent(messages=...).
# ---------------------------------------------------------------------------

class TestSecondMessageExistingSession:

    def test_prior_messages_passed_to_agent(self, valid_event, fake_context):
        """CONTRACT: Existing session → Agent receives prior conversation history."""
        prior_messages = [
            _make_ddb_message('test-session-001', 1000, 'user', 'Hello, who are you?'),
            _make_ddb_message('test-session-001', 2000, 'assistant', 'I am your assistant.'),
        ]
        p1, p2, p3, p4, p5, p6 = _base_patches(mock_messages=prior_messages)
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5, p6:
            _setup_ddb_mock(mock_ddb)
            _make_agent_instance(MockAgent, 'Here is the account info.')

            from handler import handler
            result = handler(valid_event, fake_context)

            assert result['statusCode'] == 200

            # CONTRACT: Agent must receive the prior conversation as messages=
            MockAgent.assert_called_once()
            agent_kwargs = MockAgent.call_args.kwargs
            assert 'messages' in agent_kwargs, (
                "Agent() must receive 'messages' kwarg with prior conversation history. "
                "handler.py currently does not call get_messages() or pass messages to Agent()."
            )
            messages = agent_kwargs['messages']
            assert len(messages) == 2, f"Expected 2 prior messages, got {len(messages)}"

    def test_get_messages_called_with_correct_session(self, valid_event, fake_context):
        """CONTRACT: get_messages() must be called with the correct user_id + session_id."""
        prior_messages = [
            _make_ddb_message('test-session-001', 1000, 'user', 'First turn'),
            _make_ddb_message('test-session-001', 2000, 'assistant', 'First reply'),
        ]
        p1, p2, p3, p4, p5, p6 = _base_patches(mock_messages=prior_messages)
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5, p6 as mock_get_messages:
            _setup_ddb_mock(mock_ddb)
            _make_agent_instance(MockAgent)

            from handler import handler
            handler(valid_event, fake_context)

            mock_get_messages.assert_called_once()
            args = mock_get_messages.call_args.args
            # Signature: get_messages(dynamodb_resource, table_name, user_id, session_id)
            assert args[2] == 'test-user-001', f"Wrong user_id: {args[2]}"
            assert args[3] == 'test-session-001', f"Wrong session_id: {args[3]}"


# ---------------------------------------------------------------------------
# Test 3: Messages loaded in chronological order (oldest first)
#
# CONTRACT: Strands processes conversation history in order. Messages must be
# oldest-first so the model sees the conversation in the correct sequence.
# DDB returns messages sorted by message_id = {sessionId}:{timestamp}, which
# is already chronological — the implementation must NOT reverse this order.
# ---------------------------------------------------------------------------

class TestChronologicalOrder:

    def test_messages_passed_in_oldest_first_order(self, valid_event, fake_context):
        """CONTRACT: History passed to Agent() must be oldest-first (chronological)."""
        # DDB returns in chronological order (sorted by message_id timestamp suffix)
        prior_messages = [
            _make_ddb_message('test-session-001', 1000, 'user', 'First question'),
            _make_ddb_message('test-session-001', 2000, 'assistant', 'First answer'),
            _make_ddb_message('test-session-001', 3000, 'user', 'Second question'),
            _make_ddb_message('test-session-001', 4000, 'assistant', 'Second answer'),
        ]
        p1, p2, p3, p4, p5, p6 = _base_patches(mock_messages=prior_messages)
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5, p6:
            _setup_ddb_mock(mock_ddb)
            _make_agent_instance(MockAgent)

            from handler import handler
            handler(valid_event, fake_context)

            agent_kwargs = MockAgent.call_args.kwargs
            messages = agent_kwargs.get('messages', [])
            assert len(messages) == 4

            # Verify chronological order by checking role sequence
            roles = [m['role'] for m in messages]
            assert roles == ['user', 'assistant', 'user', 'assistant'], (
                f"Messages must be in chronological order (oldest first). Got roles: {roles}"
            )

            # Verify the actual text appears in the right position
            assert 'First question' in messages[0]['content'][0]['text']
            assert 'First answer' in messages[1]['content'][0]['text']
            assert 'Second question' in messages[2]['content'][0]['text']
            assert 'Second answer' in messages[3]['content'][0]['text']


# ---------------------------------------------------------------------------
# Test 4: Alternating user/assistant turns — correct role mapping
#
# CONTRACT: DDB source values 'user' and 'assistant' map directly to Strands
# message roles. The converted format must use role='user' for user messages
# and role='assistant' for assistant messages.
# ---------------------------------------------------------------------------

class TestRoleMapping:

    def test_ddb_source_mapped_to_strands_role(self, valid_event, fake_context):
        """CONTRACT: DDB source 'user'/'assistant' maps to Strands role field."""
        prior_messages = [
            _make_ddb_message('test-session-001', 1000, 'user', 'User turn'),
            _make_ddb_message('test-session-001', 2000, 'assistant', 'Assistant turn'),
        ]
        p1, p2, p3, p4, p5, p6 = _base_patches(mock_messages=prior_messages)
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5, p6:
            _setup_ddb_mock(mock_ddb)
            _make_agent_instance(MockAgent)

            from handler import handler
            handler(valid_event, fake_context)

            agent_kwargs = MockAgent.call_args.kwargs
            messages = agent_kwargs.get('messages', [])
            assert len(messages) == 2

            assert messages[0]['role'] == 'user', (
                f"DDB source='user' must map to role='user', got: {messages[0]['role']}"
            )
            assert messages[1]['role'] == 'assistant', (
                f"DDB source='assistant' must map to role='assistant', got: {messages[1]['role']}"
            )

    def test_message_text_wrapped_in_content_blocks(self, valid_event, fake_context):
        """CONTRACT: Message text must be wrapped as Strands content blocks.

        Strands expects: {"role": "user", "content": [{"text": "..."}]}
        Not: {"role": "user", "content": "..."}
        """
        prior_messages = [
            _make_ddb_message('test-session-001', 1000, 'user', 'What are my orders?'),
            _make_ddb_message('test-session-001', 2000, 'assistant', 'You have 3 orders.'),
        ]
        p1, p2, p3, p4, p5, p6 = _base_patches(mock_messages=prior_messages)
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5, p6:
            _setup_ddb_mock(mock_ddb)
            _make_agent_instance(MockAgent)

            from handler import handler
            handler(valid_event, fake_context)

            agent_kwargs = MockAgent.call_args.kwargs
            messages = agent_kwargs.get('messages', [])

            for msg in messages:
                assert isinstance(msg['content'], list), (
                    f"content must be a list of content blocks, got {type(msg['content'])}: {msg}"
                )
                assert len(msg['content']) >= 1
                assert 'text' in msg['content'][0], (
                    f"content block must have 'text' key, got: {msg['content'][0]}"
                )
                assert isinstance(msg['content'][0]['text'], str)

            assert 'What are my orders?' in messages[0]['content'][0]['text']
            assert 'You have 3 orders.' in messages[1]['content'][0]['text']


# ---------------------------------------------------------------------------
# Test 5: Consecutive same-role messages repaired
#
# CONTRACT: Strands (and Bedrock) require alternating user/assistant turns.
# If DDB has two consecutive user messages (e.g., user sent a follow-up before
# the assistant replied, or a message was mis-stored), a synthetic assistant
# filler message must be inserted to maintain the alternating turn requirement.
#
# This mirrors fixTurnTakingErrors() in the TypeScript path:
# services/pika/src/lambda/converse/index.ts
# ---------------------------------------------------------------------------

class TestTurnRepair:

    def test_consecutive_user_messages_get_synthetic_assistant_inserted(self, valid_event, fake_context):
        """CONTRACT: Two user messages in a row → synthetic assistant inserted between them."""
        prior_messages = [
            _make_ddb_message('test-session-001', 1000, 'user', 'First user message'),
            # Missing assistant reply — second user message immediately follows
            _make_ddb_message('test-session-001', 2000, 'user', 'Second user message'),
            _make_ddb_message('test-session-001', 3000, 'assistant', 'Assistant reply'),
        ]
        p1, p2, p3, p4, p5, p6 = _base_patches(mock_messages=prior_messages)
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5, p6:
            _setup_ddb_mock(mock_ddb)
            _make_agent_instance(MockAgent)

            from handler import handler
            handler(valid_event, fake_context)

            agent_kwargs = MockAgent.call_args.kwargs
            messages = agent_kwargs.get('messages', [])

            # After repair: 3 DDB messages + 1 synthetic = 4 total
            assert len(messages) == 4, (
                f"Expected 4 messages after inserting synthetic assistant filler, got {len(messages)}. "
                f"Roles: {[m['role'] for m in messages]}"
            )
            roles = [m['role'] for m in messages]
            assert roles == ['user', 'assistant', 'user', 'assistant'], (
                f"After repair, roles must alternate. Got: {roles}"
            )

    def test_consecutive_assistant_messages_get_synthetic_user_inserted(self, valid_event, fake_context):
        """CONTRACT: Two assistant messages in a row → synthetic user inserted between them."""
        prior_messages = [
            _make_ddb_message('test-session-001', 1000, 'user', 'User question'),
            _make_ddb_message('test-session-001', 2000, 'assistant', 'First assistant reply'),
            # Two consecutive assistant messages (e.g., tool result stored incorrectly)
            _make_ddb_message('test-session-001', 3000, 'assistant', 'Second assistant reply'),
        ]
        p1, p2, p3, p4, p5, p6 = _base_patches(mock_messages=prior_messages)
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5, p6:
            _setup_ddb_mock(mock_ddb)
            _make_agent_instance(MockAgent)

            from handler import handler
            handler(valid_event, fake_context)

            agent_kwargs = MockAgent.call_args.kwargs
            messages = agent_kwargs.get('messages', [])

            # After repair: 3 DDB messages + 1 synthetic = 4 total
            assert len(messages) == 4, (
                f"Expected 4 messages after synthetic user filler inserted, got {len(messages)}. "
                f"Roles: {[m['role'] for m in messages]}"
            )
            roles = [m['role'] for m in messages]
            assert roles == ['user', 'assistant', 'user', 'assistant'], (
                f"After repair, roles must alternate. Got: {roles}"
            )

    def test_repaired_history_has_no_consecutive_same_roles(self, valid_event, fake_context):
        """CONTRACT: No two adjacent messages in the history passed to Agent() share a role."""
        # Pathological case: many consecutive same-role messages
        prior_messages = [
            _make_ddb_message('test-session-001', 1000, 'user', 'User 1'),
            _make_ddb_message('test-session-001', 2000, 'user', 'User 2'),
            _make_ddb_message('test-session-001', 3000, 'user', 'User 3'),
            _make_ddb_message('test-session-001', 4000, 'assistant', 'Assistant 1'),
            _make_ddb_message('test-session-001', 5000, 'assistant', 'Assistant 2'),
        ]
        p1, p2, p3, p4, p5, p6 = _base_patches(mock_messages=prior_messages)
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5, p6:
            _setup_ddb_mock(mock_ddb)
            _make_agent_instance(MockAgent)

            from handler import handler
            handler(valid_event, fake_context)

            agent_kwargs = MockAgent.call_args.kwargs
            messages = agent_kwargs.get('messages', [])

            for i in range(len(messages) - 1):
                assert messages[i]['role'] != messages[i + 1]['role'], (
                    f"Consecutive same-role messages at index {i} and {i+1}: "
                    f"{messages[i]['role']} followed by {messages[i+1]['role']}. "
                    f"All roles: {[m['role'] for m in messages]}"
                )


# ---------------------------------------------------------------------------
# Test 6: Agent receives full history, not just the last N messages
#
# CONTRACT: All messages from the session must be loaded and passed. There must
# be no arbitrary truncation at the history-loading layer (conversation window
# management, if needed, is the responsibility of the Strands ConversationManager,
# not of our history-loading code).
# ---------------------------------------------------------------------------

class TestFullHistoryLoaded:

    def test_all_messages_passed_not_just_recent(self, valid_event, fake_context):
        """CONTRACT: All N prior messages are passed to Agent(), not just the last few."""
        # Build a long conversation with 10 turns (20 messages)
        prior_messages = []
        for i in range(10):
            ts_user = (i * 2 + 1) * 1000
            ts_asst = (i * 2 + 2) * 1000
            prior_messages.append(
                _make_ddb_message('test-session-001', ts_user, 'user', f'User turn {i + 1}')
            )
            prior_messages.append(
                _make_ddb_message('test-session-001', ts_asst, 'assistant', f'Assistant turn {i + 1}')
            )

        p1, p2, p3, p4, p5, p6 = _base_patches(mock_messages=prior_messages)
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5, p6:
            _setup_ddb_mock(mock_ddb)
            _make_agent_instance(MockAgent)

            from handler import handler
            result = handler(valid_event, fake_context)

            assert result['statusCode'] == 200

            agent_kwargs = MockAgent.call_args.kwargs
            messages = agent_kwargs.get('messages', [])

            assert len(messages) == 20, (
                f"All 20 prior messages must be passed to Agent(), got {len(messages)}. "
                "History loading must not truncate — let Strands ConversationManager manage the window."
            )

            # Verify first and last messages are present (not just a window)
            first_text = messages[0]['content'][0]['text']
            last_text = messages[-1]['content'][0]['text']
            assert 'User turn 1' in first_text, f"First message missing, got: {first_text}"
            assert 'Assistant turn 10' in last_text, f"Last message missing, got: {last_text}"
