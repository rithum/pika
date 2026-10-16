"""A finalize override on an unbuffered turn reaches the stream and the stored message once."""
from custom_hooks_base import FinalizeResult
from tests.agent_doubles import assert_primary_path, streaming_agent_cls
from tests.hook_defaults import override_hooks  # noqa: F401
from tests.test_response_hooks import _run_handler, assistant


def test_force_write_on_an_unbuffered_turn_writes_the_override_once(override_hooks, caplog):
    override_hooks.finalize_response = (
        lambda final, ctx: FinalizeResult(text='Rewritten.', force_write=True))
    agent_cls, created = streaming_agent_cls('Plain answer.')

    result, stored, _ = _run_handler(agent_cls)

    assert created[0].init_kwargs['callback_handler'] is not None
    assert result['body'].count('Plain answer.') == 1
    assert result['body'].count('Rewritten.') == 1
    assert [m['message'] for m in assistant(stored)] == ['Rewritten.']
    assert_primary_path(caplog)


def test_finalize_override_without_force_write_is_stored_but_not_rewritten_to_the_stream(
        override_hooks, caplog):
    override_hooks.finalize_response = lambda final, ctx: FinalizeResult(text='Rewritten.')
    agent_cls, _created = streaming_agent_cls('Plain answer.')

    result, stored, _ = _run_handler(agent_cls)

    assert result['body'].count('Plain answer.') == 1
    assert 'Rewritten.' not in result['body']
    assert [m['message'] for m in assistant(stored)] == ['Rewritten.']
    assert_primary_path(caplog)
