"""
CONTRACT TESTS: Supervisor/collaborator pattern via Strands Swarm multi-agent.

These tests are EXPECTED TO FAIL until Swarm-based collaborator support is implemented.

Observable behavior contracts:
  - When agent_def.collaborators is present, the handler creates a Swarm (not a plain Agent)
  - Each collaborator in the definition becomes a node in the Swarm
  - The supervisor (requested) agent is the Swarm entry_point
  - Each collaborator agent uses its own base_prompt, not the supervisor's prompt
  - A supervisor with collaborators returns a valid 200 response
  - An agent without collaborators uses a plain Agent — no Swarm, no regression
"""

import json
import contextlib
import pytest
from unittest.mock import MagicMock, patch

from strands.tools.tools import PythonAgentTool
from custom_hooks_base import COLLABORATOR_FAILURE_MESSAGE, HOOK_ERROR_MESSAGE, RequestContext
from tests.hook_defaults import base_hooks, override_hooks  # noqa: F401


MOCK_SUPERVISOR_DEF = {
    'agent_id': 'rithum-bot',
    'base_prompt': 'You are a supervisor that routes tasks to specialized agents.',
    'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'tool_ids': [],
    'collaborators': [
        {
            'agent_id': 'order-analyzer-2',
            'instruction': 'Handles order analysis queries',
            'base_prompt': 'You are an order analysis expert.',
        },
        {
            'agent_id': 'item-analyzer',
            'instruction': 'Handles item catalog queries',
            'base_prompt': 'You are an item catalog expert.',
        },
    ],
}

MOCK_PLAIN_AGENT_DEF = {
    'agent_id': 'plain-bot',
    'base_prompt': 'You are a plain agent with no collaborators.',
    'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'tool_ids': [],
}


def _make_event(agent_id='rithum-bot', session_id='sess-001', user_id='user-001',
                message='Analyze this order'):
    return {
        'body': json.dumps({
            'agentId': agent_id,
            'userId': user_id,
            'sessionId': session_id,
            'message': message,
        })
    }


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


# Collaborator definitions keyed by agent_id — load_agent returns these per-ID
MOCK_COLLABORATOR_DEFS = {
    'order-analyzer-2': {
        'agent_id': 'order-analyzer-2',
        'base_prompt': 'You are an order analysis expert.',
        'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'tool_ids': [],
    },
    'item-analyzer': {
        'agent_id': 'item-analyzer',
        'base_prompt': 'You are an item catalog expert.',
        'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'tool_ids': [],
    },
}


def _make_load_agent(supervisor_def):
    """Return a load_agent mock that returns the correct def per agent ID."""
    def load_agent(ddb, agent_id):
        if agent_id in MOCK_COLLABORATOR_DEFS:
            return MOCK_COLLABORATOR_DEFS[agent_id]
        return supervisor_def
    return load_agent


def _apply_base_patches(stack, agent_def, mock_agent_cls=None, mock_swarm_cls=None):
    """Enter all standard patches into an ExitStack and return (mock_agent, mock_swarm)."""
    if mock_agent_cls is None:
        mock_agent_instance = MagicMock(return_value='Task complete.')
        mock_agent_cls = MagicMock(return_value=mock_agent_instance)
    if mock_swarm_cls is None:
        mock_swarm_cls = MagicMock()

    stack.enter_context(patch('boto3.resource', return_value=MagicMock()))
    stack.enter_context(patch('handler.add_message'))
    stack.enter_context(patch('handler.ensure_session'))
    stack.enter_context(patch('handler.load_agent', side_effect=_make_load_agent(agent_def)))
    stack.enter_context(patch('handler.load_tools', return_value=[]))
    stack.enter_context(patch('handler.build_strands_tools', return_value=[]))
    stack.enter_context(patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}))
    stack.enter_context(patch('handler.get_messages', return_value=[]))
    stack.enter_context(patch('handler.Agent', mock_agent_cls))
    stack.enter_context(patch('handler.Swarm', mock_swarm_cls))

    return mock_agent_cls, mock_swarm_cls


# ---------------------------------------------------------------------------
# Tests: Swarm is used when collaborators are present
# ---------------------------------------------------------------------------

class TestSwarmCreatedForCollaborators:
    """Observable: handler uses a multi-agent pattern when collaborators are configured."""

    def test_swarm_constructed_when_collaborators_present(self):
        """When agent_def has collaborators, the handler must construct a Swarm.

        Contract: The supervisor+collaborator topology requires a Swarm — not a plain Agent call.
        """
        import handler as h  # noqa: PLC0415

        mock_swarm_instance = MagicMock(return_value='Routed result.')
        mock_swarm_cls = MagicMock(return_value=mock_swarm_instance)

        with contextlib.ExitStack() as stack:
            _apply_base_patches(stack, MOCK_SUPERVISOR_DEF, mock_swarm_cls=mock_swarm_cls)
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200
        assert mock_swarm_cls.called, (
            'handler.Swarm must be constructed when agent_def has collaborators'
        )

    def test_no_swarm_when_collaborators_absent(self):
        """When agent_def has no collaborators, the handler must NOT construct a Swarm.

        Contract: Plain agents are unaffected by the collaborator feature — no Swarm overhead.
        """
        import handler as h  # noqa: PLC0415

        mock_swarm_cls = MagicMock()

        with contextlib.ExitStack() as stack:
            _apply_base_patches(stack, MOCK_PLAIN_AGENT_DEF, mock_swarm_cls=mock_swarm_cls)
            result = h.handler(_make_event(agent_id='plain-bot'), _make_ctx())

        assert result['statusCode'] == 200
        assert not mock_swarm_cls.called, (
            'handler.Swarm must NOT be constructed when agent_def has no collaborators'
        )


# ---------------------------------------------------------------------------
# Tests: Swarm receives the correct nodes
# ---------------------------------------------------------------------------

class TestSwarmNodes:
    """Observable: the Swarm is constructed with the right number of agent nodes."""

    def test_swarm_receives_supervisor_plus_all_collaborators(self):
        """The Swarm must include the supervisor and every collaborator as nodes.

        Contract: 1 supervisor + 2 collaborators → 3 nodes total in the Swarm.
        """
        import handler as h  # noqa: PLC0415

        mock_swarm_instance = MagicMock(return_value='Done.')
        mock_swarm_cls = MagicMock(return_value=mock_swarm_instance)

        with contextlib.ExitStack() as stack:
            _apply_base_patches(stack, MOCK_SUPERVISOR_DEF, mock_swarm_cls=mock_swarm_cls)
            h.handler(_make_event(), _make_ctx())

        assert mock_swarm_cls.called, 'Swarm must be constructed'
        _, kwargs = mock_swarm_cls.call_args
        nodes = kwargs.get('nodes') or (mock_swarm_cls.call_args[0][0] if mock_swarm_cls.call_args[0] else [])
        expected_count = 1 + len(MOCK_SUPERVISOR_DEF['collaborators'])  # 3
        assert len(nodes) == expected_count, (
            f'Swarm nodes count must be {expected_count} (supervisor + collaborators). '
            f'Got: {len(nodes)}'
        )

    def test_swarm_entry_point_is_supervisor(self):
        """The Swarm entry_point must be the supervisor agent, not a random collaborator.

        Contract: The user's request is routed to the supervisor first; it decides what to delegate.
        """
        import handler as h  # noqa: PLC0415

        captured_agents = []

        class TrackingAgent:
            def __init__(self, **kwargs):
                self._system_prompt = kwargs.get('system_prompt', '')
                captured_agents.append(self)

            def __call__(self, *args, **kwargs):
                return 'Done.'

        mock_swarm_instance = MagicMock(return_value='Done.')
        mock_swarm_cls = MagicMock(return_value=mock_swarm_instance)

        with contextlib.ExitStack() as stack:
            _apply_base_patches(stack, MOCK_SUPERVISOR_DEF,
                                mock_agent_cls=TrackingAgent, mock_swarm_cls=mock_swarm_cls)
            h.handler(_make_event(), _make_ctx())

        assert mock_swarm_cls.called, 'Swarm must be constructed'
        _, kwargs = mock_swarm_cls.call_args
        entry_point = kwargs.get('entry_point')
        assert entry_point is not None, 'Swarm must receive an entry_point kwarg'

        supervisor_prompt = MOCK_SUPERVISOR_DEF['base_prompt']
        assert entry_point._system_prompt == supervisor_prompt, (
            f'Swarm entry_point must be the supervisor agent (prompt: {supervisor_prompt!r}). '
            f'Got: {entry_point._system_prompt!r}'
        )


# ---------------------------------------------------------------------------
# Tests: Collaborator system prompts
# ---------------------------------------------------------------------------

class TestCollaboratorSystemPrompts:
    """Observable: each collaborator agent is constructed with its own base_prompt."""

    def test_collaborator_agents_use_their_own_base_prompts(self):
        """Each collaborator must be constructed with its own base_prompt, not the supervisor's.

        Contract: Collaborator specialization depends on each agent receiving the correct prompt.
        """
        import handler as h  # noqa: PLC0415

        captured_prompts = []

        class TrackingAgent:
            def __init__(self, **kwargs):
                captured_prompts.append(kwargs.get('system_prompt', ''))

            def __call__(self, *args, **kwargs):
                return 'Done.'

        mock_swarm_instance = MagicMock(return_value='Done.')
        mock_swarm_cls = MagicMock(return_value=mock_swarm_instance)

        with contextlib.ExitStack() as stack:
            _apply_base_patches(stack, MOCK_SUPERVISOR_DEF,
                                mock_agent_cls=TrackingAgent, mock_swarm_cls=mock_swarm_cls)
            h.handler(_make_event(), _make_ctx())

        collaborator_prompts = [c['base_prompt'] for c in MOCK_SUPERVISOR_DEF['collaborators']]
        for expected_prompt in collaborator_prompts:
            assert expected_prompt in captured_prompts, (
                f'Collaborator base_prompt {expected_prompt!r} must be used to construct an agent. '
                f'Agent prompts seen: {captured_prompts!r}'
            )


# ---------------------------------------------------------------------------
# Tests: End-to-end response
# ---------------------------------------------------------------------------

class TestSupervisorReturns200:
    """Observable: a supervisor agent with collaborators returns a valid 200 response."""

    def test_supervisor_with_collaborators_returns_200(self):
        """A supervisor agent with collaborators must return HTTP 200.

        Contract: The user gets an answer — not an error or crash — when delegation is configured.
        """
        import handler as h  # noqa: PLC0415

        mock_swarm_instance = MagicMock(return_value='Order has been analyzed.')
        mock_swarm_cls = MagicMock(return_value=mock_swarm_instance)

        with contextlib.ExitStack() as stack:
            _apply_base_patches(stack, MOCK_SUPERVISOR_DEF, mock_swarm_cls=mock_swarm_cls)
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200, (
            f'Supervisor agent with collaborators must return 200. Got: {result.get("statusCode")}'
        )


# ---------------------------------------------------------------------------
# Tests: Swarm output has proper streaming format
# ---------------------------------------------------------------------------

class TestSwarmStreamingFormat:
    """Observable: Swarm output includes traces, tags, and pika-metadata like plain Agent."""

    def test_swarm_output_includes_pika_metadata(self):
        """Swarm response must include <pika-metadata> at the end, just like plain Agent.

        Contract: The frontend parses pika-metadata for session tracking — it must be
        present regardless of whether a Swarm or plain Agent handled the request.
        """
        import re
        import handler as h  # noqa: PLC0415

        mock_swarm_instance = MagicMock(return_value='Supervisor routed successfully.')
        mock_swarm_cls = MagicMock(return_value=mock_swarm_instance)

        with contextlib.ExitStack() as stack:
            _apply_base_patches(stack, MOCK_SUPERVISOR_DEF, mock_swarm_cls=mock_swarm_cls)
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200
        body = result.get('body', '')
        assert '<pika-metadata>' in body, (
            f'Swarm response must include <pika-metadata> tag. Got body: {body[:200]!r}'
        )
        match = re.search(r'<pika-metadata>(.*?)</pika-metadata>', body, re.DOTALL)
        assert match, 'pika-metadata must contain valid content'
        metadata = json.loads(match.group(1))
        assert 'userMessageId' in metadata
        assert 'assistantMessageId' in metadata

    def test_swarm_collaborator_text_appears_in_response_body(self):
        """Text output from collaborator agents must appear in the response body.

        Contract: When the supervisor delegates to a collaborator, the collaborator's
        response text must be visible in the streamed output — not silently dropped.
        """
        import handler as h  # noqa: PLC0415

        # Swarm that returns text including collaborator output.
        # The async stream path must raise so the sync fallback fires — otherwise
        # MagicMock().stream_async() silently yields zero events and the async
        # path "succeeds" with empty output. This matches the production contract:
        # sync fallback only fires on async-path failure.
        mock_swarm_instance = MagicMock()
        mock_swarm_instance.return_value = 'The order analyzer found 42 orders.'
        mock_swarm_instance.stream_async.side_effect = RuntimeError('stream_async unavailable')
        mock_swarm_cls = MagicMock(return_value=mock_swarm_instance)

        with contextlib.ExitStack() as stack:
            _apply_base_patches(stack, MOCK_SUPERVISOR_DEF, mock_swarm_cls=mock_swarm_cls)
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200
        body = result.get('body', '')
        # The collaborator's response text must be in the body
        assert '42 orders' in body, (
            f'Collaborator response text must appear in body. Got: {body[:300]!r}'
        )


TOOL_MODE_DEF = {
    **MOCK_SUPERVISOR_DEF,
    'collaborators': [{
        'agentId': 'item-analyzer',
        'mode': 'tool',
        'instruction': 'Return structured item analysis.',
        'historyRelay': 'TO_COLLABORATOR',
        'outputSchema': {
            'type': 'object',
            'properties': {'kind': {'const': 'RESULT'}},
            'required': ['kind'],
        },
    }],
}


def _failing_collaborator_builder(*codes):
    def build(_collaborators, *, failure_callback=None, **_kwargs):
        assert callable(failure_callback)

        def fail(tool_use, **_invocation_state):
            for code in codes:
                failure_callback(code)
            return {
                'toolUseId': tool_use.get('toolUseId', ''),
                'status': 'error',
                'content': [{'text': json.dumps({'error': codes[0]})}],
            }

        return [PythonAgentTool(
            'consult_item_analyzer',
            {
                'name': 'consult_item_analyzer',
                'description': 'Consult the item analyzer.',
                'inputSchema': {'json': {'type': 'object'}},
            },
            fail,
        )]

    return build


class _SupervisorCallingFailingTool:
    def __init__(self, **kwargs):
        self.tool = kwargs['tools'][0]

    def __call__(self, _prompt, *, invocation_state):
        response = self.tool._tool_func({'toolUseId': 'consult-1', 'input': {}})
        assert response['status'] == 'error'
        assert invocation_state['stop_event'].is_set()
        return 'internal collaborator failure detail'


def _run_tool_mode(build_side_effect, mock_agent_cls, agent_def=TOOL_MODE_DEF):
    import handler as h  # noqa: PLC0415

    with contextlib.ExitStack() as stack:
        _apply_base_patches(
            stack,
            agent_def,
            mock_agent_cls=mock_agent_cls,
            mock_swarm_cls=MagicMock(),
        )
        build_hidden = stack.enter_context(patch(
            'handler.build_tool_mode_collaborators',
            side_effect=build_side_effect,
        ))
        result = h.handler(_make_event(), _make_ctx())
        persisted = [
            call.args[2]['message']
            for call in h.add_message.call_args_list
            if call.args[2].get('source') == 'assistant'
        ]
    return result, persisted, build_hidden


@pytest.mark.usefixtures('base_hooks')
class TestToolModeCollaboratorOwnership:
    """Tool-mode collaborators return to the supervisor; Swarm never owns prose."""

    def test_tool_mode_uses_plain_supervisor_and_only_its_final_text_is_visible(self):
        supervisor = MagicMock(return_value='The supervisor owns the final response.')
        mock_agent_cls = MagicMock(return_value=supervisor)
        specialist_tool = MagicMock()

        result, _, build_hidden = _run_tool_mode(
            lambda *_a, **_k: [specialist_tool], mock_agent_cls,
        )

        assert result['statusCode'] == 200
        assert 'The supervisor owns the final response.' in result['body']
        assert build_hidden.called
        assert specialist_tool in mock_agent_cls.call_args.kwargs['tools']

    def test_tool_mode_does_not_build_a_swarm(self):
        import handler as h  # noqa: PLC0415

        mock_swarm_cls = MagicMock()
        with contextlib.ExitStack() as stack:
            _apply_base_patches(stack, TOOL_MODE_DEF, mock_swarm_cls=mock_swarm_cls)
            stack.enter_context(patch(
                'handler.build_tool_mode_collaborators',
                return_value=[MagicMock()],
            ))
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200
        assert not mock_swarm_cls.called

    def test_tool_mode_failure_stops_supervisor_and_completes_user_turn(self):
        result, persisted, _ = _run_tool_mode(
            _failing_collaborator_builder('COLLABORATOR_OUTPUT_INVALID'),
            MagicMock(side_effect=_SupervisorCallingFailingTool),
        )

        assert result['statusCode'] == 200
        assert result['body'].count(COLLABORATOR_FAILURE_MESSAGE) == 1
        assert 'internal collaborator failure detail' not in result['body']
        assert result['body'].rstrip().endswith('</pika-metadata>')
        assert persisted == [COLLABORATOR_FAILURE_MESSAGE]

    def test_verify_reprompt_is_skipped_when_tool_mode_collaborators_are_configured(self, caplog):
        caplog.set_level('INFO', logger='handler')
        agent_def = {
            **TOOL_MODE_DEF,
            'verification': {'enabled': True, 'autoRepromptThreshold': 'C'},
        }
        supervisor = MagicMock(return_value='Supervisor answer.')

        with patch('handler.verify_response',
                   return_value={'classification': 'F', 'explanation': 'Unsupported claim.'}):
            result, _, _ = _run_tool_mode(
                lambda *_a, **_k: [MagicMock()],
                MagicMock(return_value=supervisor),
                agent_def=agent_def,
            )

        assert result['statusCode'] == 200
        assert supervisor.call_count == 1
        assert 'Reprompt skipped: tool-mode collaborators are configured' in caplog.text


class TestToolModeCollaboratorHooks:
    """The collaborator hooks receive the request context and keep the turn safe when they fail."""

    def test_failure_message_override_receives_the_first_code_only(self, override_hooks):
        calls = []

        def collaborator_failure_message(codes, ctx):
            calls.append((list(codes), ctx.session_id))
            return 'Custom failure text.'

        override_hooks.collaborator_failure_message = collaborator_failure_message
        result, persisted, _ = _run_tool_mode(
            _failing_collaborator_builder('COLLABORATOR_OUTPUT_INVALID', 'COLLABORATOR_TIMEOUT'),
            MagicMock(side_effect=_SupervisorCallingFailingTool),
        )

        assert calls == [(['COLLABORATOR_OUTPUT_INVALID'], 'sess-001')]
        assert result['body'].count('Custom failure text.') == 1
        assert COLLABORATOR_FAILURE_MESSAGE not in result['body']
        assert persisted == ['Custom failure text.']

    def test_failing_failure_message_hook_uses_the_base_message_when_fail_closed(self, override_hooks):
        def collaborator_failure_message(_codes, _ctx):
            raise RuntimeError('override bug')

        override_hooks.HOOKS_FAIL_CLOSED = True
        override_hooks.collaborator_failure_message = collaborator_failure_message
        result, persisted, _ = _run_tool_mode(
            _failing_collaborator_builder('COLLABORATOR_OUTPUT_INVALID'),
            MagicMock(side_effect=_SupervisorCallingFailingTool),
        )

        assert result['statusCode'] == 200
        assert result['body'].count(COLLABORATOR_FAILURE_MESSAGE) == 1
        assert persisted == [COLLABORATOR_FAILURE_MESSAGE]

    def test_hidden_tool_results_reach_the_hook_with_the_request_context(self, override_hooks):
        seen = []

        def on_hidden_tool_result(tool_name, result, ctx, *, invocation_input=None):
            seen.append((tool_name, result, invocation_input, isinstance(ctx, RequestContext),
                         ctx.session_id))

        def build(_collaborators, *, on_hidden_tool_result=None, **_kwargs):
            assert callable(on_hidden_tool_result)
            on_hidden_tool_result('get_status', None, invocation_input={'parameters': []})
            on_hidden_tool_result('get_status', '{"status":"DONE"}')
            return [MagicMock()]

        override_hooks.on_hidden_tool_result = on_hidden_tool_result
        result, _, _ = _run_tool_mode(
            build, MagicMock(return_value=MagicMock(return_value='Supervisor answer.')),
        )

        assert result['statusCode'] == 200
        assert seen == [
            ('get_status', None, {'parameters': []}, True, 'sess-001'),
            ('get_status', '{"status":"DONE"}', None, True, 'sess-001'),
        ]

    def test_failing_hidden_tool_hook_is_log_only_when_fail_closed(self, override_hooks):
        def on_hidden_tool_result(*_args, **_kwargs):
            raise RuntimeError('override bug')

        def build(_collaborators, *, on_hidden_tool_result=None, **_kwargs):
            on_hidden_tool_result('get_status', '{"status":"DONE"}')
            return [MagicMock()]

        override_hooks.HOOKS_FAIL_CLOSED = True
        override_hooks.on_hidden_tool_result = on_hidden_tool_result
        result, persisted, _ = _run_tool_mode(
            build, MagicMock(return_value=MagicMock(return_value='Supervisor answer.')),
        )

        assert result['statusCode'] == 200
        assert result['body'].count('Supervisor answer.') == 1
        assert HOOK_ERROR_MESSAGE not in result['body']
        assert persisted == ['Supervisor answer.']


@pytest.mark.usefixtures('base_hooks')
class TestSwarmTraceBoundaryUnchanged:
    """Tool-mode trace suppression must not alter Swarm collaborator tool traces."""
    def test_swarm_collaborator_tool_building_still_receives_trace_callback(self):
        import handler as h  # noqa: PLC0415

        captured_callbacks = []

        def load_agent_with_tools(_ddb, agent_id):
            if agent_id in MOCK_COLLABORATOR_DEFS:
                return {
                    **MOCK_COLLABORATOR_DEFS[agent_id],
                    'tool_ids': ['order-tools'],
                }
            return MOCK_SUPERVISOR_DEF

        def capture_build_tools(
                tool_defs, session_id, input_text,
                session_attributes=None, prompt_session_attributes=None,
                trace_callback=None):
            captured_callbacks.append(trace_callback)
            return []

        mock_swarm_instance = MagicMock(return_value='Swarm routed.')
        mock_swarm_cls = MagicMock(return_value=mock_swarm_instance)

        with contextlib.ExitStack() as stack:
            stack.enter_context(patch('boto3.resource', return_value=MagicMock()))
            stack.enter_context(patch('handler.add_message'))
            stack.enter_context(patch('handler.ensure_session'))
            stack.enter_context(patch('handler.load_agent', side_effect=load_agent_with_tools))
            stack.enter_context(patch(
                'handler.load_tools',
                return_value=[{'tool_id': 'order-tools', 'execution_type': 'inline'}],
            ))
            stack.enter_context(
                patch('handler.build_strands_tools', side_effect=capture_build_tools)
            )
            stack.enter_context(patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}))
            stack.enter_context(patch('handler.get_messages', return_value=[]))
            stack.enter_context(patch('handler.Agent', MagicMock(return_value=MagicMock(return_value='Done.'))))
            stack.enter_context(patch('handler.Swarm', mock_swarm_cls))
            result = h.handler(_make_event(), _make_ctx())

        assert result['statusCode'] == 200
        assert mock_swarm_cls.called
        assert captured_callbacks, 'Swarm path must still build collaborator tools'
        assert all(cb is not None for cb in captured_callbacks), (
            'Swarm collaborator tool builds must keep trace_callback wired'
        )
