"""Threshold-gated auto-reprompt for verifyResponse; the correction goes to the reasoning panel."""
import json
import re
import pytest
from unittest.mock import MagicMock, patch

from handler import DEFAULT_MODEL_ID
from tests.agent_doubles import assert_primary_path, streaming_agent_cls
from tests.hook_defaults import base_hooks  # noqa: F401
from verification import should_reprompt

pytestmark = pytest.mark.usefixtures('base_hooks')


class TestShouldReprompt:
    """Pure-function contract for the threshold gate."""

    @pytest.mark.parametrize('classification', ['A', 'B', 'C', 'F', 'U'])
    def test_no_threshold_never_reprompts(self, classification):
        assert should_reprompt(classification, None) is False
        assert should_reprompt(classification, '') is False

    @pytest.mark.parametrize('threshold', ['B', 'C', 'F'])
    def test_no_reprompt_string_never_reprompts_even_with_threshold(self, threshold):
        assert should_reprompt('A', threshold) is False
        assert should_reprompt('U', threshold) is False

    def test_threshold_b_reprompts_b_c_f_only(self):
        assert should_reprompt('B', 'B') is True
        assert should_reprompt('C', 'B') is True
        assert should_reprompt('F', 'B') is True
        assert should_reprompt('A', 'B') is False
        assert should_reprompt('U', 'B') is False

    def test_threshold_c_reprompts_c_f_but_not_b(self):
        assert should_reprompt('C', 'C') is True
        assert should_reprompt('F', 'C') is True
        assert should_reprompt('B', 'C') is False

    def test_threshold_f_reprompts_only_f(self):
        assert should_reprompt('F', 'F') is True
        assert should_reprompt('B', 'F') is False
        assert should_reprompt('C', 'F') is False

    @pytest.mark.parametrize('threshold', ['Z', 'a', 'AA', 'bb'])
    def test_invalid_threshold_treated_as_no_threshold(self, threshold):
        for classification in ('A', 'B', 'C', 'F', 'U'):
            assert should_reprompt(classification, threshold) is False


MOCK_AGENT_DEF = {
    'agent_id': 'agent-verify',
    'base_prompt': 'Be helpful.',
    'foundation_model': DEFAULT_MODEL_ID,
    'tool_ids': [],
    'verification': {'enabled': True},
}


def _event(features=None):
    body = {
        'agentId': 'agent-verify',
        'userId': 'user-001',
        'sessionId': 'sess-001',
        'message': 'Tell me about robots.',
        'features': {'traces': {'enabled': True}, **(features or {})},
    }
    return {'body': json.dumps(body)}


def _ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


def _run_handler(event, ctx, agent_def, agent_cls, verify_results):
    mock_ddb = MagicMock()
    stored_messages = []
    mock_ddb.Table.return_value.put_item.side_effect = (
        lambda **kw: stored_messages.append(kw.get('Item', {}))
    )

    import handler as h  # noqa: PLC0415

    with (
        patch('boto3.resource', return_value=mock_ddb),
        patch('handler.Agent', agent_cls),
        patch('handler.load_agent', return_value=agent_def),
        patch('handler.load_tools', return_value=[]),
        patch('handler.build_strands_tools', return_value=[]),
        patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
        patch('handler.get_messages', return_value=[]),
        patch('handler.verify_response', side_effect=verify_results) as verify_mock,
    ):
        result = h.handler(event, ctx)

    assistant_msgs = [m for m in stored_messages if m.get('source') == 'assistant']
    return result, assistant_msgs, verify_mock


class TestHandlerRepromptThreshold:
    """Handler-level: the threshold gates the reprompt, not the grade alone."""

    def test_feature_level_threshold_wins_over_agent_level(self, caplog):
        """Feature-level autoRepromptThreshold overrides the agent-level default."""
        agent_def = {
            **MOCK_AGENT_DEF,
            'verification': {'enabled': True, 'autoRepromptThreshold': 'B'},
        }
        agent_cls, created = streaming_agent_cls('Main answer.')

        result, assistant_msgs, _ = _run_handler(
            _event(features={'verifyResponse': {'autoRepromptThreshold': 'F'}}),
            _ctx(),
            agent_def,
            agent_cls,
            verify_results=[{'classification': 'C', 'explanation': 'Unstated assumption.'}],
        )

        assert result['statusCode'] == 200
        assert created[0].calls == [], 'threshold F must not reprompt a C-graded response'
        assert 'Verified Response: C' in result['body']
        assert '[Correction]' not in result['body']
        verifications = assistant_msgs[-1].get('verifications', {})
        assert 'correction' not in verifications, f'no correction expected. Got: {verifications}'
        assert_primary_path(caplog)

    def test_threshold_c_does_not_reprompt_b_graded_response(self, caplog):
        """With threshold C, a B grade must not trigger a second agent call."""
        agent_cls, created = streaming_agent_cls('Main answer with a stated assumption.')

        result, assistant_msgs, _ = _run_handler(
            _event(features={'verifyResponse': {'autoRepromptThreshold': 'C'}}),
            _ctx(),
            MOCK_AGENT_DEF,
            agent_cls,
            verify_results=[{'classification': 'B', 'explanation': 'Assumption stated.'}],
        )

        assert result['statusCode'] == 200
        assert created[0].calls == [], 'B-graded response must not be reprompted at threshold C'
        assert '[Correction]' not in result['body']
        assert 'Verified Response: B' in result['body']
        verifications = assistant_msgs[-1].get('verifications', {})
        assert 'correction' not in verifications, f'no correction expected. Got: {verifications}'
        assert_primary_path(caplog)

    def test_reprompt_routes_correction_to_trace_not_answer(self, caplog):
        """When the threshold is met, the correction is routed to the reasoning panel, not the answer."""
        main_answer = 'Main answer with an unstated assumption.'
        correction = 'Assumption: robots need power.'
        agent_cls, created = streaming_agent_cls(main_answer, corrections=[correction])

        result, assistant_msgs, verify_mock = _run_handler(
            _event(features={'verifyResponse': {'autoRepromptThreshold': 'C'}}),
            _ctx(),
            MOCK_AGENT_DEF,
            agent_cls,
            verify_results=[
                {'classification': 'C', 'explanation': 'Assumptions not stated.'},
                {'classification': 'A', 'explanation': 'Now stated.'},
            ],
        )

        assert result['statusCode'] == 200
        assert len(created[0].calls) == 1, 'C grade at threshold C must trigger exactly one reprompt'
        assert '### Corrections' not in result['body']
        assert f'[Correction] {correction}' in result['body']
        assert 'Verified Response: C' in result['body']
        assert 'Correction Verified Response: A' in result['body']
        assert assistant_msgs[-1]['message'] == main_answer
        assert verify_mock.call_count == 2
        assert verify_mock.call_args_list[1].args[1] == f'{main_answer}\n\n{correction}'
        verifications = assistant_msgs[-1].get('verifications', {})
        assert verifications.get('correction') == 'A'
        assert_primary_path(caplog)

    def test_correction_is_not_streamed_on_a_live_agent(self, caplog):
        correction = 'Assumption: robots need power.'
        agent_cls, created = streaming_agent_cls('Main answer.', corrections=[correction])

        result, _assistant_msgs, _ = _run_handler(
            _event(features={'verifyResponse': {'autoRepromptThreshold': 'C'}}),
            _ctx(),
            MOCK_AGENT_DEF,
            agent_cls,
            verify_results=[
                {'classification': 'C', 'explanation': 'Assumptions not stated.'},
                {'classification': 'A', 'explanation': 'Now stated.'},
            ],
        )

        agent = created[0]
        answer = re.sub(r'<trace>.*?</trace>', '', result['body'], flags=re.DOTALL)
        assert agent.init_kwargs['callback_handler'] is not None
        assert correction not in answer
        assert f'[Correction] {correction}' in result['body']
        assert agent.callback_handler is agent.init_kwargs['callback_handler']
        assert_primary_path(caplog)
