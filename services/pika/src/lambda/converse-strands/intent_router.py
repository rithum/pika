"""
Intent Router — pre-agent command dispatch for the Strands converse Lambda.

Ports services/pika/src/lib/intent-router/*.ts to Python, preserving semantics:

  1. Aggregate commands from tag definitions (intent_router_commands list per tag).
  2. Filter by required context (per-command `requires_context` field).
  3. Classify user message against eligible commands via a fast LLM (Haiku
     InvokeModel, stateless, ~200-400ms).
  4. Route based on classification:
       - 'direct'      → execute inline, stream response (optionally pass to agent)
       - 'dispatch'    → stream dispatch event for client-side widget
       - 'passthrough' → fall through to normal agent flow

Feature gate (checked by caller):
  features.intentRouter.enabled == True AND mode == 'chat-app'

Mock classifications (for local dev / tests): set the
INTENT_ROUTER_MOCK_CLASSIFICATIONS env var to a JSON map of
lowercase-user-message-substring → {commandId, confidence, reasoning}. When
set, classification skips the LLM and matches against this map.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

# Match the TS defaults
DEFAULT_CONFIDENCE_THRESHOLD = 0.80
DEFAULT_CLASSIFIER_MODEL_ID = os.environ.get(
    'INTENT_ROUTER_MODEL',
    'us.anthropic.claude-haiku-4-5-20251001-v1:0',
)
CLASSIFIER_MAX_TOKENS = 150
CLASSIFIER_TEMPERATURE = 0


# ---------------------------------------------------------------------------
# Command aggregation + per-chat-app cache
# ---------------------------------------------------------------------------

_command_cache: dict[str, tuple[float, list[dict]]] = {}
_CACHE_TTL_SECONDS = 5 * 60
_cache_lock = threading.Lock()


def clear_intent_router_cache() -> None:
    """Invalidate the per-chat-app aggregated-command cache."""
    with _cache_lock:
        _command_cache.clear()


def load_commands_for_chat_app(
    chat_app_id: str, tag_defs: list[dict],
    intent_router_config: dict | None = None,
) -> list[dict]:
    """Aggregate intent_router_commands from tag definitions for a chat app.

    Sorted by effective_priority (highest first). Applies command_overrides from
    intent_router_config (disable flags and priority boosts).
    """
    _ = chat_app_id  # Used by caller for cache keying; left unused here for API symmetry.
    overrides = (intent_router_config or {}).get('commandOverrides') or {}
    aggregated: list[dict] = []

    for tag_def in tag_defs or []:
        commands = tag_def.get('intent_router_commands') or tag_def.get('intentRouterCommands') or []
        if not commands:
            continue

        tag_id = f"{tag_def.get('scope', '')}.{tag_def.get('tag', '')}"
        tag_overrides = overrides.get(tag_id) or {}

        for cmd in commands:
            cmd_id = cmd.get('command_id') or cmd.get('commandId')
            if not cmd_id:
                continue
            cmd_override = tag_overrides.get(cmd_id) or {}
            if cmd_override.get('disabled'):
                continue

            priority = int(cmd.get('priority') or 0)
            effective_priority = priority + int(cmd_override.get('priorityBoost') or 0)

            aggregated.append({
                **cmd,
                'command_id': cmd_id,
                'tag_id': tag_id,
                'effective_priority': effective_priority,
            })

    aggregated.sort(key=lambda c: c['effective_priority'], reverse=True)
    return aggregated


def get_commands_cached(chat_app_id: str, loader: Callable[[], list[dict]]) -> list[dict]:
    """Return aggregated commands for a chat app, cached for 5 minutes."""
    now = time.time()
    with _cache_lock:
        cached = _command_cache.get(chat_app_id)
        if cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
            return cached[1]
    commands = loader()
    with _cache_lock:
        _command_cache[chat_app_id] = (now, commands)
    return commands


# ---------------------------------------------------------------------------
# Feature gate
# ---------------------------------------------------------------------------

def should_run(features: dict, mode: str) -> bool:
    """True when Intent Router should run for this request."""
    if mode != 'chat-app':
        return False
    ir = (features or {}).get('intentRouter') or {}
    return bool(ir.get('enabled'))


# ---------------------------------------------------------------------------
# Classification — LLM (Haiku) with mock override for tests/local dev
# ---------------------------------------------------------------------------

def _load_mock_classifications() -> dict | None:
    raw = os.environ.get('INTENT_ROUTER_MOCK_CLASSIFICATIONS')
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception as e:
        logger.warning(f"Failed to parse INTENT_ROUTER_MOCK_CLASSIFICATIONS: {e}")
        return None


def _classify_with_mock(message: str, mocks: dict) -> dict:
    lower = message.lower().strip()
    # exact match first
    if lower in mocks:
        m = mocks[lower]
        return {
            'matched': True, 'commandId': m.get('commandId'),
            'confidence': float(m.get('confidence', 1.0)),
            'reasoning': m.get('reasoning', 'mock match (exact)'),
        }
    # substring match
    for pattern, m in mocks.items():
        if pattern.lower() in lower:
            return {
                'matched': True, 'commandId': m.get('commandId'),
                'confidence': float(m.get('confidence', 1.0)),
                'reasoning': m.get('reasoning', 'mock match (substring)'),
            }
    return {'matched': False, 'confidence': 0.0, 'reasoning': 'no mock match'}


def _classify_offline_by_examples(message: str, commands: list[dict]) -> dict:
    """Deterministic fallback classifier: match the message against examples /
    anti_examples using case-insensitive substring equality. Used when bedrock
    is unavailable AND no mock classifications are set.

    This is NOT the production path — production uses the LLM. This exists so
    tests stay hermetic without stubbing boto3 for every call.
    """
    lower = message.lower().strip()
    best = None
    for cmd in commands:
        antis = [a.lower() for a in (cmd.get('anti_examples') or cmd.get('antiExamples') or [])]
        if any(a == lower or a in lower for a in antis):
            continue
        examples = [e.lower() for e in (cmd.get('examples') or [])]
        hit = any(e == lower or e in lower or lower in e for e in examples)
        if hit:
            priority = int(cmd.get('effective_priority') or cmd.get('priority') or 0)
            score = (priority, cmd.get('command_id') or '')
            if best is None or score > best[0]:
                best = (score, cmd)
    if best:
        return {
            'matched': True, 'commandId': best[1].get('command_id'),
            'confidence': 0.95,
            'reasoning': 'offline example match',
        }
    return {'matched': False, 'confidence': 0.0, 'reasoning': 'no offline example match'}


def _build_classification_prompt(message: str, commands: list[dict],
                                 context: dict | None = None) -> str:
    # Escape via JSON so newlines, control chars, backslashes, and unicode
    # separators can't break out of the "..." literal we embed in the prompt.
    # Strip surrounding quotes so callers can wrap in their own "…" context.
    escaped = json.dumps(message, ensure_ascii=False)[1:-1]

    parts = []
    for i, cmd in enumerate(commands, start=1):
        cmd_id = cmd.get('command_id')
        desc = cmd.get('description', '')
        examples = cmd.get('examples') or []
        antis = cmd.get('anti_examples') or cmd.get('antiExamples') or []
        ex_block = '\n'.join(f'    - "{e}"' for e in examples)
        anti_block = '\n'.join(f'    - "{a}"' for a in antis)
        block = [f"### Command {i}: {cmd_id}",
                 f"**Description:** {desc}",
                 f"**Examples that SHOULD match:**\n{ex_block}"]
        if anti_block:
            block.append(f"**Examples that should NOT match:**\n{anti_block}")
        parts.append('\n'.join(block))

    context_section = ''
    if context:
        try:
            ctx_json = json.dumps(context, indent=2, default=str)
            if len(ctx_json) > 2000:
                ctx_json = ctx_json[:2000] + '\n... (truncated)'
            context_section = f"\n## Available Context\n{ctx_json}\n"
        except Exception:
            pass

    return (
        "You are an intent classification system. Your job is to determine if a user's "
        "message matches any of the available commands.\n\n"
        "## Available Commands\n"
        f"{chr(10).join(parts)}\n"
        f"{context_section}\n"
        f'## User Message\n"{escaped}"\n\n'
        "## Instructions\n"
        "1. Analyze the user's message and determine if it matches any of the commands above.\n"
        "2. Consider the examples and anti-examples carefully — anti-examples show queries that are similar but should NOT match.\n"
        "3. A match should be clear and intentional, not just semantically similar.\n"
        "4. If multiple commands could match, choose the one with the highest relevance.\n\n"
        "## Response Format\n"
        "Respond with a JSON object (no markdown formatting):\n"
        '{\n  "matched": true/false,\n  "commandId": "the_command_id" (if matched),\n'
        '  "confidence": 0.0-1.0,\n  "reasoning": "Brief explanation"\n}\n\n'
        "Important:\n"
        "- Only set matched=true if you're confident the user wants this specific action.\n"
        "- Questions like \"what is X?\" or \"how do I X?\" are usually NOT action commands.\n"
        "- If unsure, set matched=false with lower confidence.\n"
    )


def _extract_first_json_object(text: str) -> Optional[dict]:
    """Parse the first JSON object in *text*.

    Uses json.JSONDecoder.raw_decode so nested braces and multiple objects on
    one line don't confuse the parse. A greedy regex like `\\{.*\\}` would
    span from the first `{` to the last `}`, merging multiple objects.
    """
    if not text:
        return None
    decoder = json.JSONDecoder()
    for i, ch in enumerate(text):
        if ch == '{':
            try:
                obj, _ = decoder.raw_decode(text[i:])
                if isinstance(obj, dict):
                    return obj
            except json.JSONDecodeError:
                continue
    return None


def _classify_with_llm(message: str, commands: list[dict], context: dict | None,
                       bedrock_client) -> dict:
    prompt = _build_classification_prompt(message, commands, context)
    body = json.dumps({
        'anthropic_version': 'bedrock-2023-05-31',
        'max_tokens': CLASSIFIER_MAX_TOKENS,
        'temperature': CLASSIFIER_TEMPERATURE,
        'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': prompt}]}],
    })
    try:
        response = bedrock_client.invoke_model(modelId=DEFAULT_CLASSIFIER_MODEL_ID, body=body)
        parsed = json.loads(response['body'].read())
        raw_text = parsed.get('content', [{}])[0].get('text', '')
        parsed_obj = _extract_first_json_object(raw_text or '')
        if parsed_obj is None:
            return {'matched': False, 'confidence': 0.0, 'reasoning': 'classifier returned no JSON'}
        return parsed_obj
    except Exception as e:
        logger.warning(f"Intent Router classification error: {e}")
        return {'matched': False, 'confidence': 0.0, 'reasoning': f'classifier error: {e}'}


# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------

def _find_command(commands: list[dict], command_id: str) -> Optional[dict]:
    for cmd in commands:
        if cmd.get('command_id') == command_id:
            return cmd
    return None


def _interpolate(value: Any, context: dict) -> Any:
    """Minimal {{context.path.to.value}} substitution for response_template and payload."""
    if isinstance(value, str):
        def repl(m):
            path = m.group(1).strip().split('.')
            cur: Any = {'context': context}
            for key in path:
                if isinstance(cur, dict):
                    cur = cur.get(key, '')
                else:
                    return ''
            return str(cur) if cur is not None else ''
        return re.sub(r'\{\{\s*(.+?)\s*\}\}', repl, value)
    if isinstance(value, dict):
        return {k: _interpolate(v, context) for k, v in value.items()}
    if isinstance(value, list):
        return [_interpolate(v, context) for v in value]
    return value


def route(message: str, commands: list[dict], confidence_threshold: float = DEFAULT_CONFIDENCE_THRESHOLD,
          context: dict | None = None, bedrock_client: Any = None) -> dict:
    """Classify message and return a route decision.

    Returns one of:
      {'type': 'direct', 'command_id', 'tag_id', 'pika_command', 'response',
       'pass_to_agent', 'confidence'}
      {'type': 'dispatch', 'command_id', 'tag_id', 'handler_tag_id', 'payload',
       'response', 'confidence'}
      {'type': 'passthrough', 'reason'}
    """
    context = context or {}

    # Required-context filtering
    eligible = []
    for cmd in commands:
        required = cmd.get('requires_context') or cmd.get('requiresContext') or []
        if required:
            ok = all(_has_context_path(context, p) for p in required)
            if not ok:
                continue
        eligible.append(cmd)

    if not eligible:
        return {'type': 'passthrough', 'reason': 'no eligible commands'}

    # Classify
    mocks = _load_mock_classifications()
    if mocks is not None:
        result = _classify_with_mock(message, mocks)
    elif bedrock_client is not None:
        result = _classify_with_llm(message, eligible, context, bedrock_client)
    else:
        # Last-resort offline path; not used in production
        result = _classify_offline_by_examples(message, eligible)

    if not result.get('matched'):
        return {'type': 'passthrough', 'reason': result.get('reasoning', 'no match')}

    cmd = _find_command(eligible, result.get('commandId'))
    if cmd is None:
        return {'type': 'passthrough', 'reason': f'classifier returned unknown command: {result.get("commandId")}'}

    conf = float(result.get('confidence', 0.0))
    per_cmd_threshold = cmd.get('confidence_threshold') or cmd.get('confidenceThreshold')
    threshold = float(per_cmd_threshold) if per_cmd_threshold is not None else float(confidence_threshold)
    if conf < threshold:
        return {'type': 'passthrough',
                'reason': f'confidence {conf} below threshold {threshold}'}

    execution = cmd.get('execution') or {}
    exec_mode = execution.get('mode')
    response_template = execution.get('response_template') or execution.get('responseTemplate') or ''
    response_rendered = _interpolate(response_template, context) if response_template else ''

    if exec_mode == 'direct':
        pika_cmd = _interpolate(execution.get('command') or {}, context)
        return {
            'type': 'direct',
            'command_id': cmd['command_id'],
            'tag_id': cmd.get('tag_id'),
            'pika_command': pika_cmd,
            'response': response_rendered,
            'pass_to_agent': bool(execution.get('pass_to_agent') or execution.get('passToAgent')),
            'confidence': conf,
        }

    # dispatch (default)
    payload = _interpolate(execution.get('payload') or {}, context)
    return {
        'type': 'dispatch',
        'command_id': cmd['command_id'],
        'tag_id': cmd.get('tag_id'),
        'handler_tag_id': execution.get('handler_tag_id') or execution.get('handlerTagId'),
        'payload': payload,
        'response': response_rendered,
        'confidence': conf,
    }


def _has_context_path(context: dict, path: str) -> bool:
    cur: Any = context
    for key in path.split('.'):
        if isinstance(cur, dict) and key in cur:
            cur = cur[key]
        else:
            return False
    return cur is not None


# ---------------------------------------------------------------------------
# Stream emission — matches TS stream-helpers.ts wire format
# ---------------------------------------------------------------------------

def build_router_trace(result: dict) -> dict:
    """Build the orchestrationTrace dict for an intent-router routing decision."""
    if result['type'] == 'passthrough':
        trace_text = json.dumps({
            'type': 'intent-router', 'matched': False,
            'reason': result.get('reason', ''),
        })
    elif result['type'] == 'direct':
        trace_text = json.dumps({
            'type': 'intent-router', 'matched': True,
            'commandId': result.get('command_id'),
            'tagId': result.get('tag_id'),
            'confidence': result.get('confidence'),
            'mode': 'direct',
        })
    elif result['type'] == 'dispatch':
        trace_text = json.dumps({
            'type': 'intent-router', 'matched': True,
            'commandId': result.get('command_id'),
            'tagId': result.get('tag_id'),
            'handlerTagId': result.get('handler_tag_id'),
            'confidence': result.get('confidence'),
            'mode': 'dispatch',
        })
    else:
        trace_text = json.dumps({'type': 'intent-router', 'matched': False,
                                 'reason': 'unknown result type'})

    return {'orchestrationTrace': {'rationale': {'traceId': 'intent-router',
                                                 'text': trace_text}}}


def build_dispatch_event(result: dict, user_message: str, session_id: str,
                         user_id: str, context: dict | None = None) -> str:
    """Return the <pika-command-dispatch>...</pika-command-dispatch> wire chunk."""
    event = {
        'commandId': result.get('command_id'),
        'intent': result.get('command_id'),
        'confidence': result.get('confidence'),
        'handlerTagId': result.get('handler_tag_id'),
        'payload': result.get('payload') or {},
        'context': context or {},
        'userMessage': user_message,
        'sessionId': session_id,
        'userId': user_id,
    }
    return f"<pika-command-dispatch>{json.dumps(event)}</pika-command-dispatch>"


def build_command_chunk(pika_command: dict) -> str:
    """Return the <pika-command>...</pika-command> wire chunk."""
    return f"<pika-command>{json.dumps(pika_command)}</pika-command>"
