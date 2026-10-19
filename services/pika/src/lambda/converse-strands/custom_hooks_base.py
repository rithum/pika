"""Default hooks and settings for the Strands converse handler.

Consumers override any name defined here by defining it in `custom_hooks.py`, which pika
sync never overwrites. The handler reads every hook and setting through `resolve_hook` at
call time, so an override file written for an older pika release keeps working: a name it
lacks resolves to the default below.
"""
import importlib
import logging
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

TOOL_LOOP_POLLING_TOOLS: frozenset[str] = frozenset()
TOOL_LOOP_TRIPPED_MESSAGE = (
    "I stopped because the same action repeated without making progress. "
    "Please try again; if it continues, narrow the request or contact support."
)
TOOL_DEADLINE_MESSAGE = (
    "I ran out of time before I could finish this request. "
    "Please try again; if it continues, narrow the request or contact support."
)
ACCOUNT_PIN_ENABLED = True
ACCOUNT_PIN_MISMATCH_MESSAGE = (
    "This conversation is linked to the account it was started with, and your "
    "active account has since changed. Please start a new conversation to "
    "continue working with your current account."
)
COLLABORATOR_FAILURE_MESSAGE = (
    "I'm sorry, I couldn't complete this request safely. "
    "Please try again; if it continues, contact support."
)
HOOKS_FAIL_CLOSED = False
HOOK_ERROR_MESSAGE = "I'm sorry, I encountered an error processing your request."
TOOL_FAILURE_BODY_SENTINEL: str | None = None


@dataclass
class RequestContext:
    agent_id: str
    chat_app_id: str
    session_id: str
    user_id: str
    body: dict
    message: str
    state: Any = None


@dataclass
class FinalResponse:
    text: str
    buffered: bool
    collaborator_failure_codes: list[str]
    agent_error: BaseException | None
    tools: list


@dataclass
class FinalizeResult:
    text: str
    force_write: bool = False
    skip_verification: bool = False


@dataclass
class CorrectionResult:
    text: str
    replay: bool = True


class HookFailure(Exception):
    """A hook raised while `HOOKS_FAIL_CLOSED` is set; the handler ends the turn safely."""

    def __init__(self, name: str):
        super().__init__(name)
        self.name = name


def resolve_hook(name: str) -> Any:
    """The consumer's override of `name` if `custom_hooks` defines it, else the default."""
    return getattr(importlib.import_module('custom_hooks'), name, globals()[name])


def call_hook(name: str, *args, **kwargs) -> Any:
    """Call the resolved hook `name`.

    If it raises, the error is logged. With `HOOKS_FAIL_CLOSED` set, `HookFailure` is
    raised for the handler to act on; otherwise the default hook's result is returned.
    """
    try:
        return resolve_hook(name)(*args, **kwargs)
    except Exception as e:
        logger.exception('hook_error name=%s', name)
        if resolve_hook('HOOKS_FAIL_CLOSED'):
            raise HookFailure(name) from e
        return globals()[name](*args, **kwargs)


def begin_request(ctx: RequestContext) -> Any:
    return None


def should_buffer_final_response(ctx: RequestContext) -> bool:
    return False


def collaborator_failure_message(codes: list[str], ctx: RequestContext) -> str:
    return resolve_hook('COLLABORATOR_FAILURE_MESSAGE')


def on_hidden_tool_result(tool_name: str, result: Any, ctx: RequestContext, *,
                          invocation_input: dict | None = None) -> None:
    return None


def finalize_response(final: FinalResponse, ctx: RequestContext) -> FinalizeResult:
    return FinalizeResult(text=final.text)


def filter_correction(correction_text: str, ctx: RequestContext) -> CorrectionResult:
    return CorrectionResult(text=correction_text)
