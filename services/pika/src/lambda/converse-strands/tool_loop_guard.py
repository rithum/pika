"""Per-turn circuit breaker for repeated identical Strands tool calls."""
import json
import logging
import threading
import time
from typing import Any

from strands.hooks import HookProvider, HookRegistry
from strands.hooks.events import AfterToolCallEvent, BeforeModelCallEvent, BeforeToolCallEvent

logger = logging.getLogger(__name__)

# One initial execution plus two retries covers normal transient recovery while
# preventing a model from polling the same immutable request indefinitely.
MAX_IDENTICAL_TOOL_EXECUTIONS = 3

MAX_READ_ONLY_POLL_EXECUTIONS = 15

# A failed call is retried at most once with the same input; a timeout costs
# the full tool timeout on every attempt.
MAX_FAILED_IDENTICAL_EXECUTIONS = 2


def _canonical_signature(tool_use: dict[str, Any]) -> str:
    """Return a stable function+parameters identity, excluding toolUseId."""
    function_name = str(tool_use.get('name') or '')
    params = tool_use.get('input') or {}
    canonical_params = json.dumps(
        params,
        sort_keys=True,
        separators=(',', ':'),
        default=str,
    )
    return f"{function_name}:{canonical_params}"


def _is_failed_result(event: AfterToolCallEvent) -> bool:
    if event.exception is not None:
        return True
    return (event.result or {}).get('status') == 'error'


class ToolLoopGuard(HookProvider):
    """Bound repeated tool calls and tool starts that cannot finish in time.

    The first cancellation for a failing call or for the deadline goes back to the model
    so it can still answer; a repeat after the model has seen it cancels the turn.
    """

    def __init__(
        self,
        max_identical_executions: int = MAX_IDENTICAL_TOOL_EXECUTIONS,
        tool_start_deadline: float | None = None,
        *,
        polling_tools: frozenset[str] = frozenset(),
        loop_message: str,
        deadline_message: str,
    ):
        if max_identical_executions < 1:
            raise ValueError('max_identical_executions must be at least 1')
        self._max_identical_executions = max_identical_executions
        self._tool_start_deadline = tool_start_deadline
        self._polling_tools = frozenset(polling_tools)
        self._deadline_message = deadline_message
        self._signature_counts: dict[str, int] = {}
        self._failure_counts: dict[str, int] = {}
        self._blocked_signatures: set[str] = set()
        self._delivered_blocked_signatures: set[str] = set()
        self._deadline_notified = False
        self._deadline_notice_delivered = False
        self._lock = threading.Lock()
        self.tripped = False
        self.tool_call_count = 0
        self.user_message = loop_message

    def register_hooks(self, registry: HookRegistry, **kwargs: Any) -> None:
        registry.add_callback(BeforeToolCallEvent, self.before_tool_call)
        registry.add_callback(AfterToolCallEvent, self.after_tool_call)
        registry.add_callback(BeforeModelCallEvent, self.before_model_call)

    def before_model_call(self, event: BeforeModelCallEvent) -> None:
        with self._lock:
            self._delivered_blocked_signatures |= self._blocked_signatures
            self._deadline_notice_delivered = self._deadline_notified

    def after_tool_call(self, event: AfterToolCallEvent) -> None:
        if event.cancel_message is not None or not _is_failed_result(event):
            return
        signature = _canonical_signature(event.tool_use)
        with self._lock:
            self._failure_counts[signature] = self._failure_counts.get(signature, 0) + 1

    def before_tool_call(self, event: BeforeToolCallEvent) -> None:
        if self._cancel_past_deadline(event) or self._cancel_repeated_failure(event):
            return
        self._cancel_identical_loop(event)

    def _cancel_past_deadline(self, event: BeforeToolCallEvent) -> bool:
        if self._tool_start_deadline is None or time.monotonic() < self._tool_start_deadline:
            return False
        function_name = str(event.tool_use.get('name') or '')
        with self._lock:
            trip = self._deadline_notice_delivered or self.tripped
            self._deadline_notified = True
            if trip and not self.tripped:
                self.tripped = True
                self.user_message = self._deadline_message
        logger.error(
            "Tool call cancelled: not enough time left in the turn: function=%s",
            function_name or '<unknown>',
        )
        event.cancel_tool = (
            "Not enough time is left in this turn to run another tool. Do not "
            "call any more tools. Reply to the user now with what you have, and "
            "say which step did not finish so they can ask again."
        )
        if trip:
            event.agent.cancel()
        return True

    def _cancel_repeated_failure(self, event: BeforeToolCallEvent) -> bool:
        signature = _canonical_signature(event.tool_use)
        function_name = str(event.tool_use.get('name') or '')
        with self._lock:
            if self._failure_counts.get(signature, 0) < MAX_FAILED_IDENTICAL_EXECUTIONS:
                return False
            trip = signature in self._delivered_blocked_signatures or self.tripped
            self._blocked_signatures.add(signature)
            if trip:
                self.tripped = True
        logger.error(
            "Tool call cancelled after repeated failures: function=%s failures=%d",
            function_name or '<unknown>',
            MAX_FAILED_IDENTICAL_EXECUTIONS,
        )
        event.cancel_tool = (
            f"This tool call failed {MAX_FAILED_IDENTICAL_EXECUTIONS} times with "
            "the same input in this turn. Do not retry it. Reply to the user "
            "without it and say that this step is failing right now."
        )
        if trip:
            event.agent.cancel()
        return True

    def _cancel_identical_loop(self, event: BeforeToolCallEvent) -> None:
        signature = _canonical_signature(event.tool_use)
        function_name = str(event.tool_use.get('name') or '')
        execution_limit = (
            MAX_READ_ONLY_POLL_EXECUTIONS
            if function_name in self._polling_tools
            else self._max_identical_executions
        )
        with self._lock:
            if self.tripped:
                should_cancel = True
            else:
                self.tool_call_count += 1
                count = self._signature_counts.get(signature, 0) + 1
                self._signature_counts[signature] = count
                should_cancel = count > execution_limit
                if should_cancel:
                    self.tripped = True

        if not should_cancel:
            return

        logger.error(
            "Identical tool-call circuit breaker tripped: function=%s "
            "allowed_executions=%d",
            function_name or '<unknown>',
            execution_limit,
        )
        event.cancel_tool = (
            f"Circuit breaker: blocked after {execution_limit} identical "
            "executions in this turn. Do not retry this tool call again."
        )
        event.agent.cancel()
