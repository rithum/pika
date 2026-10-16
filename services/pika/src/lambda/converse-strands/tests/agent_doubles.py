"""Agent doubles that drive the handler's primary `stream_async` path."""
from strands.handlers.callback_handler import null_callback_handler

FALLBACK_LOG_MARKERS = ('falling back to sync', 're-running synchronously')


def streaming_agent_cls(main_answer, corrections=(), narration=()):
    """An `Agent` stand-in: `stream_async` serves the turn and `__call__` serves each reprompt.

    Text goes through whatever callback handler the agent holds at that moment, as with the
    real agent, so a live callback writes it to the stream. Returns (class, created instances).
    """
    created = []
    pending = list(corrections)

    class _Agent:
        def __init__(self, **kwargs):
            self.init_kwargs = kwargs
            self.callback_handler = kwargs.get('callback_handler') or null_callback_handler
            self.calls = []
            created.append(self)

        async def stream_async(self, *_args, **_kwargs):
            for text in (*narration, main_answer):
                self.callback_handler(data=text)
                yield {'data': text}
            yield {'result': main_answer}

        def __call__(self, message, **_kwargs):
            self.calls.append(message)
            text = pending.pop(0)
            self.callback_handler(data=text)
            return text

    return _Agent, created


def assert_primary_path(caplog):
    for marker in FALLBACK_LOG_MARKERS:
        assert marker not in caplog.text, f'handler left the stream_async path: {marker!r}'
