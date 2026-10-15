import logging

import pytest

import custom_hooks_base as base
from custom_hooks_base import (
    CorrectionResult,
    FinalizeResult,
    FinalResponse,
    HookFailure,
    RequestContext,
    call_hook,
    resolve_hook,
)
from tests.hook_defaults import base_hooks, override_hooks  # noqa: F401


def _ctx() -> RequestContext:
    return RequestContext(
        agent_id='agent-1',
        chat_app_id='example-app',
        session_id='session-1',
        user_id='user-1',
        body={},
        message='hello',
    )


def _final(text: str = 'answer') -> FinalResponse:
    return FinalResponse(
        text=text,
        buffered=True,
        collaborator_failure_codes=[],
        agent_error=None,
        tools=[],
    )


class TestShippedOverrideFile:
    def test_pika_custom_hooks_overrides_nothing(self):
        import custom_hooks

        overridden = [
            name for name in dir(custom_hooks)
            if not name.startswith('__') and hasattr(base, name)
        ]
        assert overridden == []


class TestDefaults:
    def test_default_hooks_change_nothing(self, base_hooks):
        ctx = _ctx()
        assert call_hook('begin_request', ctx) is None
        assert call_hook('should_buffer_final_response', ctx) is False
        assert call_hook('finalize_response', _final('answer'), ctx) == FinalizeResult(text='answer')
        assert call_hook('filter_correction', 'fix', ctx) == CorrectionResult(text='fix', replay=True)
        assert call_hook('on_hidden_tool_result', 'tool', None, ctx, invocation_input={'a': 1}) is None

    def test_default_settings(self, base_hooks):
        assert resolve_hook('TOOL_LOOP_POLLING_TOOLS') == frozenset()
        assert resolve_hook('ACCOUNT_PIN_ENABLED') is True
        assert resolve_hook('HOOKS_FAIL_CLOSED') is False

    def test_collaborator_failure_message_default(self, base_hooks):
        assert call_hook('collaborator_failure_message', ['timeout'], _ctx()) == base.COLLABORATOR_FAILURE_MESSAGE

    def test_base_hooks_hides_a_consumer_override(self, override_hooks):
        override_hooks.ACCOUNT_PIN_ENABLED = False
        assert resolve_hook('ACCOUNT_PIN_ENABLED') is False


class TestOverrides:
    def test_partial_override_falls_back_for_missing_names(self, override_hooks):
        override_hooks.finalize_response = lambda final, ctx: FinalizeResult(text=final.text.upper())
        ctx = _ctx()
        assert call_hook('finalize_response', _final('answer'), ctx).text == 'ANSWER'
        assert call_hook('filter_correction', 'fix', ctx) == CorrectionResult(text='fix')
        assert resolve_hook('TOOL_DEADLINE_MESSAGE') == base.TOOL_DEADLINE_MESSAGE

    def test_constant_override_reaches_the_default_hook(self, override_hooks):
        override_hooks.COLLABORATOR_FAILURE_MESSAGE = 'Custom failure text.'
        assert call_hook('collaborator_failure_message', ['timeout'], _ctx()) == 'Custom failure text.'

    def test_override_module_can_import_base_types(self, override_hooks):
        exec(
            'from custom_hooks_base import FinalizeResult\n'
            'def finalize_response(final, ctx):\n'
            '    return FinalizeResult(text="x", force_write=True)\n',
            override_hooks.__dict__,
        )
        result = call_hook('finalize_response', _final(), _ctx())
        assert result == FinalizeResult(text='x', force_write=True)


class TestHookErrors:
    @staticmethod
    def _raise(*args, **kwargs):
        raise RuntimeError('boom')

    def test_fail_open_returns_the_default_and_logs(self, override_hooks, caplog):
        override_hooks.finalize_response = self._raise
        with caplog.at_level(logging.ERROR, logger='custom_hooks_base'):
            result = call_hook('finalize_response', _final('answer'), _ctx())
        assert result == FinalizeResult(text='answer')
        assert 'hook_error name=finalize_response' in caplog.text

    def test_fail_closed_raises_hook_failure(self, override_hooks):
        override_hooks.HOOKS_FAIL_CLOSED = True
        override_hooks.finalize_response = self._raise
        with pytest.raises(HookFailure) as exc:
            call_hook('finalize_response', _final(), _ctx())
        assert exc.value.name == 'finalize_response'
        assert isinstance(exc.value.__cause__, RuntimeError)

    def test_fail_closed_does_not_affect_hooks_that_succeed(self, override_hooks):
        override_hooks.HOOKS_FAIL_CLOSED = True
        assert call_hook('should_buffer_final_response', _ctx()) is False
