"""
CONTRACT TESTS: Auto-title generation for new sessions in the Strands converse Lambda.

These tests are EXPECTED TO FAIL until title generation is implemented.

Title generation contract (mirrors TypeScript bedrock-agent.ts):
  - Triggered when: a question was asked AND an answer was given AND chatSession.title == null
  - Uses InvokeModelCommand (not Converse API) with model: anthropic.claude-haiku-4-5-20251001-v1:0
  - Invocation parameters: max_tokens=200, temperature=1, anthropic_version='bedrock-2023-05-31'
  - Prompt template:
      "Generate a concise title (3-8 words) that captures the main topic or question from this
       conversation:\\n\\n<question>{userQuestion}</question>\\n<response>{agentResponse}</response>\\n\\n
       The title should be specific enough to distinguish this conversation from others.\\n\\n
       IMPORTANT: Return ONLY the title text with no explanations, quotes, or additional text."
  - Title extracted from parsedResponse.content[0].text
  - If extraction fails → raises Error('Bedrock returned unexpected response structure for title generation: ...')
  - Title stored as chatSession.title (string) in DynamoDB
  - Only generated once per session (title=null guard prevents regeneration)
"""

import json
import pytest
from unittest.mock import MagicMock, patch, call


TITLE_MODEL_ID = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

MOCK_AGENT_DEF = {
    'agent_id': 'agent-title',
    'base_prompt': 'Be helpful.',
    'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'tool_ids': [],
    'title_generation': {'enabled': True},
}


def _make_event(session_id='sess-no-title', message='What is the meaning of life?'):
    return {
        'body': json.dumps({
            'agentId': 'agent-title',
            'userId': 'user-001',
            'sessionId': session_id,
            'message': message,
        })
    }


def _make_ctx():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


def _make_bedrock_title_response(title_text: str) -> dict:
    """Build an InvokeModelCommand response shaped like what Bedrock returns."""
    return {
        'body': MagicMock(read=lambda: json.dumps({
            'content': [{'type': 'text', 'text': title_text}]
        }).encode()),
    }


# ---------------------------------------------------------------------------
# Tests: generate_session_title() pure function
# ---------------------------------------------------------------------------

class TestGenerateSessionTitle:
    """Contract for generate_session_title(question, answer, bedrock_client) function."""

    def test_uses_correct_model_id(self):
        """Title generation must use anthropic.claude-haiku-4-5-20251001-v1:0.

        Contract ref: bedrock-agent.ts MODELS.ANTHROPIC.Claude4_5Haiku.id
        """
        from title import generate_session_title  # noqa: PLC0415

        mock_bedrock = MagicMock()
        mock_bedrock.invoke_model.return_value = _make_bedrock_title_response('Test Title')

        generate_session_title('What is Python?', 'Python is a language.', mock_bedrock)

        call_kwargs = mock_bedrock.invoke_model.call_args
        assert call_kwargs is not None, 'invoke_model must be called'
        model_id = (call_kwargs.kwargs or call_kwargs[1]).get('modelId') or (call_kwargs.args[0] if call_kwargs.args else None)
        # Check in the body if not a direct kwarg
        body_arg = (call_kwargs.kwargs or call_kwargs[1]).get('body', b'{}')
        if isinstance(body_arg, (bytes, str)):
            body = json.loads(body_arg)
        else:
            body = {}
        actual_model = (call_kwargs.kwargs or call_kwargs[1]).get('modelId', body.get('model', ''))
        assert TITLE_MODEL_ID in str(mock_bedrock.invoke_model.call_args), (
            f'Must use model {TITLE_MODEL_ID}. Call: {mock_bedrock.invoke_model.call_args}'
        )

    def test_invocation_uses_correct_parameters(self):
        """InvokeModelCommand body must have max_tokens=200, temperature=1, anthropic_version='bedrock-2023-05-31'.

        Contract ref: bedrock-agent.ts title generation InvokeModelCommand body
        """
        from title import generate_session_title  # noqa: PLC0415

        mock_bedrock = MagicMock()
        mock_bedrock.invoke_model.return_value = _make_bedrock_title_response('Concise Title Here')

        generate_session_title('What is Python?', 'Python is a language.', mock_bedrock)

        call_kwargs = mock_bedrock.invoke_model.call_args
        body_bytes = (call_kwargs.kwargs or call_kwargs[1]).get('body', b'{}')
        body = json.loads(body_bytes if isinstance(body_bytes, bytes) else body_bytes.encode())

        assert body.get('max_tokens') == 200, f'max_tokens must be 200. Got: {body.get("max_tokens")}'
        assert body.get('temperature') == 1, f'temperature must be 1. Got: {body.get("temperature")}'
        assert body.get('anthropic_version') == 'bedrock-2023-05-31', (
            f'anthropic_version must be "bedrock-2023-05-31". Got: {body.get("anthropic_version")}'
        )

    def test_prompt_includes_question_and_response_xml_tags(self):
        """Title generation prompt must wrap question and response in <question> and <response> XML tags.

        Contract ref: bedrock-agent.ts title generation prompt template
        """
        from title import generate_session_title  # noqa: PLC0415

        mock_bedrock = MagicMock()
        mock_bedrock.invoke_model.return_value = _make_bedrock_title_response('My Title')

        question = 'What is machine learning?'
        answer = 'It is a subset of AI.'
        generate_session_title(question, answer, mock_bedrock)

        call_kwargs = mock_bedrock.invoke_model.call_args
        body_bytes = (call_kwargs.kwargs or call_kwargs[1]).get('body', b'{}')
        body = json.loads(body_bytes if isinstance(body_bytes, bytes) else body_bytes.encode())

        prompt_text = body.get('messages', [{}])[0].get('content', [{}])[0].get('text', '')
        assert f'<question>{question}</question>' in prompt_text, (
            'Prompt must wrap question in <question> tags'
        )
        assert f'<response>{answer}</response>' in prompt_text, (
            'Prompt must wrap answer in <response> tags'
        )

    def test_title_extracted_from_content_zero_text(self):
        """Title must be extracted from parsedResponse.content[0].text.

        Contract ref: bedrock-agent.ts title = parsedResponse?.content?.[0]?.text
        """
        from title import generate_session_title  # noqa: PLC0415

        expected_title = 'Python for Data Science'
        mock_bedrock = MagicMock()
        mock_bedrock.invoke_model.return_value = _make_bedrock_title_response(expected_title)

        result = generate_session_title('Tell me about Python', 'Python is great for data.', mock_bedrock)

        assert result == expected_title, (
            f'Title must be extracted from content[0].text. Got: {result!r}'
        )

    def test_missing_content_raises_error_with_expected_message(self):
        """If Bedrock returns no content[0].text, must raise Error with expected message prefix.

        Contract ref: bedrock-agent.ts
            throw new Error('Bedrock returned unexpected response structure for title generation: ...')
        """
        from title import generate_session_title  # noqa: PLC0415

        mock_bedrock = MagicMock()
        # Response with no content array
        mock_bedrock.invoke_model.return_value = {
            'body': MagicMock(read=lambda: json.dumps({'content': []}).encode()),
        }

        with pytest.raises(Exception) as exc_info:
            generate_session_title('Question?', 'Answer.', mock_bedrock)

        assert 'Bedrock returned unexpected response structure for title generation' in str(exc_info.value), (
            f'Error message must start with expected prefix. Got: {exc_info.value}'
        )


# ---------------------------------------------------------------------------
# Tests: Title generation gating in handler
# ---------------------------------------------------------------------------

class TestTitleGenerationGating:
    """Contract: title generation triggered by handler only when session has no title."""

    def test_title_generated_when_session_has_no_title(self):
        """generate_session_title must be called when session.title is null/absent.

        Contract ref: bedrock-agent.ts — title only generated when chatSession.title == null
        """
        import handler as h  # noqa: PLC0415

        event = _make_event()
        mock_ddb = MagicMock()

        # Session record has no title field
        session_record = {'user_id': 'user-001', 'session_id': 'sess-no-title', 'agent_id': 'agent-title'}
        mock_ddb.Table.return_value.get_item.return_value = {'Item': session_record}

        generate_title_calls = []

        def capture_generate_title(question, answer, bedrock_client):
            generate_title_calls.append({'question': question, 'answer': answer})
            return 'The Meaning of Life'

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', MagicMock(return_value=MagicMock(return_value='42 is the answer'))),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.generate_session_title', side_effect=capture_generate_title),
        ):
            result = h.handler(event, _make_ctx())

        assert result['statusCode'] == 200
        assert len(generate_title_calls) == 1, (
            f'generate_session_title must be called once for untitled session. '
            f'Called {len(generate_title_calls)} times.'
        )

    def test_title_not_generated_when_session_already_has_title(self):
        """generate_session_title must NOT be called when session already has a title.

        Contract ref: bedrock-agent.ts — chatSession.title == null guard prevents regeneration.
        """
        import handler as h  # noqa: PLC0415

        event = _make_event()
        mock_ddb = MagicMock()

        # Session record already has a title
        session_record = {
            'user_id': 'user-001',
            'session_id': 'sess-no-title',
            'agent_id': 'agent-title',
            'title': 'Existing Session Title',
        }
        mock_ddb.Table.return_value.get_item.return_value = {'Item': session_record}

        generate_title_calls = []

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', MagicMock(return_value=MagicMock(return_value='Some answer'))),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.generate_session_title',
                  side_effect=lambda q, a, b: generate_title_calls.append(1) or 'Ignored'),
        ):
            result = h.handler(event, _make_ctx())

        assert result['statusCode'] == 200
        assert len(generate_title_calls) == 0, (
            'generate_session_title must NOT be called when session already has a title'
        )

    def test_generated_title_stored_on_session_in_ddb(self):
        """Generated title must be written to chatSession.title in DynamoDB.

        Contract ref: bedrock-agent.ts — title stored as chatSession.title string.
        """
        import handler as h  # noqa: PLC0415

        event = _make_event()
        mock_ddb = MagicMock()

        session_record = {'user_id': 'user-001', 'session_id': 'sess-no-title', 'agent_id': 'agent-title'}
        mock_ddb.Table.return_value.get_item.return_value = {'Item': session_record}

        update_calls = []

        def capture_update(**kwargs):
            update_calls.append(kwargs)
            return {}

        mock_ddb.Table.return_value.update_item.side_effect = capture_update

        with (
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', MagicMock(return_value=MagicMock(return_value='The answer is 42'))),
            patch('handler.load_agent', return_value=MOCK_AGENT_DEF),
            patch('handler.load_tools', return_value=[]),
            patch('handler.build_strands_tools', return_value=[]),
            patch('handler.get_user', return_value={'user_id': 'user-001', 'custom_data': {}}),
            patch('handler.get_messages', return_value=[]),
            patch('handler.generate_session_title', return_value='Meaning of Life Query'),
        ):
            result = h.handler(event, _make_ctx())

        assert result['statusCode'] == 200
        # Verify a DDB update was made with the title
        title_updates = [c for c in update_calls if 'title' in str(c).lower() or 'Meaning' in str(c)]
        assert len(title_updates) >= 1, (
            f'DDB must be updated with the generated title. Update calls: {update_calls}'
        )
