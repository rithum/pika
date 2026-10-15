import json
from unittest.mock import MagicMock, patch

import pytest

import handler as handler_module
from context_items import LLM_CONTEXT_XML_ATTR, message_content_for_llm_replay, message_text_for_llm_replay
from handler import _SentUserTurnCapture, _build_bedrock_model, _persist_sent_user_content
from tests.test_history_contract import (
    _base_patches,
    _make_agent_instance,
    _make_ddb_message,
    _setup_ddb_mock,
)
from tests.hook_defaults import base_hooks  # noqa: F401

CACHE_POINT = {'cachePoint': {'type': 'default'}}
USER_HI = [{'role': 'user', 'content': [{'text': 'hi'}]}]
SONNET_5 = handler_module.SONNET_5_MODEL_ID


class TestSystemPromptCachePoint:

    def test_cache_point_follows_system_prompt_and_last_user_message(self):
        model = _build_bedrock_model(SONNET_5)
        request = model._format_request(USER_HI, None, [{'text': 'sys'}])
        assert request['system'] == [{'text': 'sys'}, CACHE_POINT]
        assert request['messages'][-1]['content'][-1] == CACHE_POINT

    def test_inference_profile_arn_gets_exactly_one_system_cache_point(self, monkeypatch):
        arn = 'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/abc'
        monkeypatch.setenv('INFERENCE_PROFILE_ANTHROPIC_Claude5Sonnet', arn)
        model = _build_bedrock_model(SONNET_5)
        request = model._format_request(USER_HI, None, [{'text': 'sys'}])
        assert request['system'] == [{'text': 'sys'}, CACHE_POINT]
        assert request['modelId'] == arn

    def test_existing_system_cache_point_is_not_duplicated(self):
        model = _build_bedrock_model(SONNET_5)
        request = model._format_request(USER_HI, None, [{'text': 'sys'}, CACHE_POINT])
        assert request['system'].count(CACHE_POINT) == 1
        assert request['system'][-1] == CACHE_POINT

    def test_missing_system_prompt_adds_no_cache_point(self):
        model = _build_bedrock_model(SONNET_5)
        request = model._format_request(USER_HI, None, None)
        assert request['system'] == []


class TestModelConstruction:

    def test_build_returns_the_bedrock_model_instance(self):
        with patch('handler.BedrockModel') as MockModel:
            model = _build_bedrock_model(SONNET_5)
        assert model is MockModel.return_value
        MockModel.assert_called_once()


class TestMessageContentForReplay:

    def test_falls_back_to_text_replay_when_attr_absent(self):
        msg = {'message': 'hello'}
        assert message_content_for_llm_replay(msg) == [{'text': message_text_for_llm_replay(msg)}]

    def test_fallback_includes_context_xml(self):
        msg = {'message': 'hello', LLM_CONTEXT_XML_ATTR: '<ctx/>'}
        assert message_content_for_llm_replay(msg) == [{'text': 'hello\n\n<ctx/>'}]

    def test_persisted_texts_replayed_as_separate_blocks(self):
        msg = {'message': 'hello', 'llm_user_content': json.dumps(['a', 'b'])}
        assert message_content_for_llm_replay(msg) == [{'text': 'a'}, {'text': 'b'}]

    @pytest.mark.parametrize('raw', ['not json', '[]', '[1]', '{"a": 1}', ''])
    def test_unusable_attr_falls_back(self, raw):
        msg = {'message': 'hello', 'llm_user_content': raw}
        assert message_content_for_llm_replay(msg) == [{'text': 'hello'}]


TOOL_RESULT_TURN = {'role': 'user', 'content': [{'toolResult': {'toolUseId': 't', 'status': 'success', 'content': [{'text': 'r'}]}}]}


class TestSentUserTurnCapture:

    def test_first_call_captures_last_user_text_blocks(self):
        model = _build_bedrock_model(SONNET_5)
        capture = _SentUserTurnCapture(model)
        messages = [{'role': 'user', 'content': [{'text': 'a'}, {'text': 'b'}]}]
        model._format_request(messages, None, [{'text': 's'}])
        assert capture.texts == ['a', 'b']

    def test_later_calls_do_not_change_capture(self):
        model = _build_bedrock_model(SONNET_5)
        capture = _SentUserTurnCapture(model)
        first = [{'role': 'user', 'content': [{'text': 'a'}]}]
        model._format_request(first, None, [{'text': 's'}])
        later = [*first, {'role': 'assistant', 'content': [{'toolUse': {'toolUseId': 't', 'name': 'n', 'input': {}}}]}, TOOL_RESULT_TURN]
        model._format_request(later, None, [{'text': 's'}])
        assert capture.texts == ['a']

    def test_non_text_block_leaves_texts_unset(self):
        model = _build_bedrock_model(SONNET_5)
        capture = _SentUserTurnCapture(model)
        messages = [{'role': 'user', 'content': [{'text': 'a'}, {'image': {'format': 'png', 'source': {'bytes': b'x'}}}]}]
        model._format_request(messages, None, [{'text': 's'}])
        assert capture.texts is None

    def test_capture_composes_with_system_cache_point(self):
        model = _build_bedrock_model(SONNET_5)
        capture = _SentUserTurnCapture(model)
        request = model._format_request(USER_HI, None, [{'text': 's'}])
        assert request['system'] == [{'text': 's'}, CACHE_POINT]
        assert capture.texts == ['hi']


class TestPersistSentUserContent:
    USER_MSG = {'user_id': 'u1', 'message_id': 's1:1', 'message': 'hi'}

    def test_no_texts_skips_write(self):
        ddb = MagicMock()
        _persist_sent_user_content(ddb, self.USER_MSG, None)
        ddb.Table.return_value.update_item.assert_not_called()

    def test_texts_are_written_as_json(self):
        ddb = MagicMock()
        _persist_sent_user_content(ddb, self.USER_MSG, ['é', 'b'])
        ddb.Table.assert_called_once_with(handler_module.CHAT_MESSAGES_TABLE)
        kwargs = ddb.Table.return_value.update_item.call_args.kwargs
        assert kwargs['Key'] == {'user_id': 'u1', 'message_id': 's1:1'}
        assert kwargs['ExpressionAttributeNames'] == {'#c': 'llm_user_content'}
        assert kwargs['ExpressionAttributeValues'] == {':c': json.dumps(['é', 'b'], ensure_ascii=False)}

    def test_oversized_payload_skips_write(self, monkeypatch):
        monkeypatch.setattr(handler_module, 'llm_context_xml_fits_message_item', lambda *_: False)
        ddb = MagicMock()
        _persist_sent_user_content(ddb, self.USER_MSG, ['a'])
        ddb.Table.return_value.update_item.assert_not_called()

    def test_write_failure_is_swallowed(self):
        ddb = MagicMock()
        ddb.Table.return_value.update_item.side_effect = RuntimeError('boom')
        _persist_sent_user_content(ddb, self.USER_MSG, ['a'])

    def test_table_lookup_failure_is_swallowed(self):
        ddb = MagicMock()
        ddb.Table.side_effect = RuntimeError('boom')
        _persist_sent_user_content(ddb, self.USER_MSG, ['a'])

    def test_budget_check_failure_is_swallowed(self, monkeypatch):
        def _raise(*_):
            raise RuntimeError('boom')
        monkeypatch.setattr(handler_module, 'llm_context_xml_fits_message_item', _raise)
        _persist_sent_user_content(MagicMock(), self.USER_MSG, ['a'])


@pytest.mark.usefixtures('base_hooks')
class TestHandlerReplaysSentUserTurn:

    def test_prior_user_turn_replayed_with_persisted_blocks(self, valid_event, fake_context):
        prior = _make_ddb_message('test-session-001', 1000, 'user', 'tail')
        prior['llm_user_content'] = json.dumps(['Context:\nexact', 'tail'])
        history = [prior, _make_ddb_message('test-session-001', 2000, 'assistant', 'reply')]
        p1, p2, p3, p4, p5, p6 = _base_patches(mock_messages=history)
        with p1 as mock_ddb, p2 as MockAgent, p3, p4, p5, p6:
            _setup_ddb_mock(mock_ddb)
            _make_agent_instance(MockAgent)
            result = handler_module.handler(valid_event, fake_context)

        assert result['statusCode'] == 200
        messages = MockAgent.call_args.kwargs['messages']
        assert messages[0]['content'] == [{'text': 'Context:\nexact'}, {'text': 'tail'}]
