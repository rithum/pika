import asyncio
import concurrent.futures
import os
import json
import queue
import re
import time
import uuid
import logging
import threading
from datetime import datetime, timezone
import boto3
import jwt as pyjwt
from strands import Agent
from strands.models.bedrock import BedrockModel, CacheConfig
from strands.multiagent.swarm import Swarm
from strands.tools.tools import PythonAgentTool
from strands.types.exceptions import MaxTokensReachedException

from pricing import extract_usage_from_result, extract_full_usage, calculate_usage
from title import generate_session_title
from verification import verify_response, get_reprompt_for_classification, build_reprompt_message
from context_items import build_context_xml, build_sent_context_record, update_session_sent_contexts

try:
    from strands_tools.agent_core_memory import AgentCoreMemoryToolProvider
except ImportError:
    AgentCoreMemoryToolProvider = None
from chat_ddb import ensure_session, update_session, add_message, get_user, get_messages, _now_iso
from agent_loader import load_agent, load_tools, build_strands_tools

# Configure the root logger with a StreamHandler so output appears in CloudWatch.
# In the Lambda Web Adapter environment, the Lambda runtime's handler isn't active;
# uvicorn runs the process, and only its own loggers have handlers by default.
logging.basicConfig(level=logging.INFO, format='%(levelname)s %(name)s: %(message)s')
logger = logging.getLogger(__name__)


def _now_ms() -> int:
    """Current time in milliseconds (epoch)."""
    return int(time.time() * 1000)

# Environment variables
CHAT_MESSAGES_TABLE = os.environ.get('CHAT_MESSAGES_TABLE', '')
CHAT_SESSION_TABLE = os.environ.get('CHAT_SESSION_TABLE', '')
CHAT_USER_TABLE = os.environ.get('CHAT_USER_TABLE', '')
STAGE = os.environ.get('STAGE', 'test')
PIKA_SERVICE_PROJ_NAME_KEBAB_CASE = os.environ.get('PIKA_SERVICE_PROJ_NAME_KEBAB_CASE', '')
DEFAULT_MODEL_ID = os.environ.get('MODEL_ID', 'us.anthropic.claude-sonnet-4-5-20250929-v1:0')
PIKA_S3_BUCKET = os.environ.get('PIKA_S3_BUCKET', '')

# Agent loop constraints
MAX_ITERATIONS = 10
LAMBDA_TIMEOUT_BUFFER_SECONDS = 30

# Heartbeat cadence — must match the TypeScript converse Lambda (bedrock-agent.ts)
HEARTBEAT_INTERVAL_SECONDS = 15


# Module-level clients (reused across warm invocations)
# Initialized lazily on first handler() call so pytest collection doesn't
# grab a real DynamoDB resource before test mocks are active.
dynamodb = None
bedrock_runtime = None

# JWT secret — fetched from SSM on cold start and cached for warm invocations
jwt_secret: str | None = None

# LRU cache for agent definitions — TTL 5 min, max 100 entries
# Mirrors the TypeScript converse Lambda's agentAndToolCache
_agent_cache: dict[str, tuple[float, dict]] = {}
_AGENT_CACHE_TTL = 300  # 5 minutes
_AGENT_CACHE_MAX = 100


def _get_cached_agent(agent_id: str) -> dict | None:
    """Return cached agent definition if still valid, else None."""
    entry = _agent_cache.get(agent_id)
    if entry is None:
        return None
    cached_at, agent_def = entry
    if time.time() - cached_at > _AGENT_CACHE_TTL:
        del _agent_cache[agent_id]
        return None
    if agent_def.get('dontCacheThis'):
        del _agent_cache[agent_id]
        return None
    return agent_def


def _put_cached_agent(agent_id: str, agent_def: dict) -> None:
    """Cache an agent definition unless it opts out."""
    if agent_def.get('dontCacheThis'):
        return
    if len(_agent_cache) >= _AGENT_CACHE_MAX:
        # Evict oldest entry
        oldest_key = min(_agent_cache, key=lambda k: _agent_cache[k][0])
        del _agent_cache[oldest_key]
    _agent_cache[agent_id] = (time.time(), agent_def)


def _clear_cache(cache_type: str, agent_id: str | None = None) -> None:
    """Clear the specified cache."""
    if cache_type == 'agent' and agent_id:
        _agent_cache.pop(agent_id, None)
    elif cache_type in ('all', 'agent'):
        _agent_cache.clear()
    if cache_type in ('all', 'intentRouterCommands'):
        try:
            from intent_router import clear_intent_router_cache  # noqa: PLC0415
            clear_intent_router_cache()
        except Exception as e:
            logger.warning(f"Failed to clear intent router cache: {e}")
    if cache_type in ('all', 'instructionAssistanceConfig'):
        try:
            from instruction_assistance import clear_config_cache  # noqa: PLC0415
            clear_config_cache()
        except Exception as e:
            logger.warning(f"Failed to clear instruction assistance config cache: {e}")
    # tagDefinitions cache is not yet implemented on the Strands path; the
    # command is accepted gracefully (no-op) rather than erroring.


# ---------------------------------------------------------------------------
# Streaming response abstraction
# ---------------------------------------------------------------------------

_STREAM_DONE = object()  # Sentinel signalling end of stream
_STREAM_HEADERS = object()  # Sentinel carrying response headers (session ID, etc.)


class _StreamWriter:
    """Writes streaming response chunks to a queue.

    The on-wire format is:
      - Plain text for answer chunks
      - <trace>JSON</trace> for Bedrock orchestration traces
      - <heartbeat/> every HEARTBEAT_INTERVAL_SECONDS to keep connections alive
      - <pika-metadata>JSON</pika-metadata> as the final frame

    All callers (app.py, local_invoke.py, tests) consume from the queue.
    """

    def __init__(self, chunk_queue: queue.Queue):
        self._queue = chunk_queue
        self._session_id: str | None = None
        self._traces: list[dict] = []

    def set_headers(self, session_id: str) -> None:
        """Record the session ID and push it to the queue.

        app.py reads this as the first item before creating the StreamingResponse,
        ensuring the x-chatbot-session-id HTTP header is set correctly.
        """
        self._session_id = session_id
        self._queue.put((_STREAM_HEADERS, {'x-chatbot-session-id': session_id}))

    @property
    def session_id(self) -> str | None:
        return self._session_id

    @property
    def traces(self) -> list[dict]:
        """All traces emitted during this request — saved on the assistant message."""
        return self._traces

    def write(self, data: str) -> None:
        self._queue.put(data if isinstance(data, str) else data.decode('utf-8'))

    def write_trace(self, trace_payload: dict) -> None:
        """Stream a trace AND collect it for persistence on the assistant message."""
        self._traces.append(trace_payload)
        self._queue.put(f'<trace>{json.dumps(trace_payload)}</trace>')

    def write_tool_result_trace(self, tool_name: str, result_text: str | None,
                                invocation_input: dict | None = None) -> None:
        """Emit tool traces for the frontend's Answer Reasoning panel.

        Called from agent_loader.py tool wrappers twice per tool call:
        1. Before invocation: invocation_input is set, result_text is None
        2. After invocation: result_text is set, invocation_input is None

        This keeps invocationInput and observation traces paired together,
        which matters when the model makes parallel tool calls.
        """
        if invocation_input is not None:
            trace_payload = {
                'orchestrationTrace': {
                    'invocationInput': {
                        'invocationType': 'ACTION_GROUP',
                        'actionGroupInvocationInput': invocation_input,
                    }
                }
            }
            self.write_trace(trace_payload)
        if result_text is not None:
            trace_payload = {
                'orchestrationTrace': {
                    'observation': {
                        'actionGroupInvocationOutput': {
                            'text': result_text,
                        },
                        'type': 'ACTION_GROUP',
                    }
                }
            }
            self.write_trace(trace_payload)

    def end(self) -> None:
        self._queue.put(_STREAM_DONE)



# ---------------------------------------------------------------------------
# Strands callback handler
# ---------------------------------------------------------------------------

def _make_callback(stream: _StreamWriter) -> callable:
    """Return a Strands callback_handler that writes chunks and traces to *stream*.

    The callback is called synchronously during agent execution, so it can write
    directly without a queue.

    Kwargs the callback receives (from Strands SDK):
      data        str   — incremental text output
      complete    bool  — True on the last text chunk of a turn
      event       dict  — raw ModelStreamChunkEvent (may contain tool use info)
      result      AgentResult — emitted once after the full turn
    """
    def callback(**kwargs):
        data: str = kwargs.get('data', '')
        event: dict = kwargs.get('event', {})

        # Write plain text chunks as they arrive
        if data:
            stream.write(data)

        # NOTE: Tool call start (invocationInput) traces are emitted from the tool
        # wrapper in agent_loader.py, not here. This keeps them paired with the
        # observation trace (tool result) so they appear in order in the UI.
        # With parallel tool use, emitting here would produce:
        #   invocationInput A → invocationInput B → observation A → observation B
        # which looks out of order.

    return callback


# ---------------------------------------------------------------------------
# Heartbeat
# ---------------------------------------------------------------------------

class _Heartbeat:
    """Sends periodic <heartbeat/> to prevent ALB / proxy idle-timeout drops."""

    def __init__(self, stream: _StreamWriter):
        self._stream = stream
        self._timer: threading.Timer | None = None
        self._stopped = threading.Event()

    def start(self) -> None:
        self._schedule()

    def stop(self) -> None:
        self._stopped.set()
        if self._timer:
            self._timer.cancel()

    def _schedule(self) -> None:
        if self._stopped.is_set():
            return
        self._timer = threading.Timer(HEARTBEAT_INTERVAL_SECONDS, self._fire)
        self._timer.daemon = True
        self._timer.start()

    def _fire(self) -> None:
        if self._stopped.is_set():
            return
        try:
            self._stream.write('<heartbeat/>')
        except Exception:
            pass  # stream may have closed
        self._schedule()


# ---------------------------------------------------------------------------
# JWT auth
# ---------------------------------------------------------------------------

def _validate_jwt_auth(event: dict, body: dict) -> tuple[dict | None, dict]:
    """Validate the x-chat-auth JWT header.

    Returns (error_response, jwt_payload):
      - error_response is non-None when auth fails; caller must return it immediately.
      - jwt_payload is the decoded JWT dict on success, or {} when auth is skipped.

    Backward compat for local dev: when event has no 'headers' key at all, auth is
    skipped (local_invoke.py omits headers).  Contract tests always include 'headers'.

    Validation order (mirrors TypeScript jwt.ts / index.ts):
      1. Check x-chat-auth header present → 401 if missing
      2. Fetch JWT secret from SSM (cold start only; cached in module-level jwt_secret)
      3. pyjwt.decode() → 401 if bad signature, expired, or missing userId
      4. JWT userId == body userId → 403 if mismatch
    """
    global jwt_secret

    headers = event.get('headers')
    if headers is None:
        # Local dev / direct Lambda invocation — skip auth
        return None, {}

    auth_header = headers.get('x-chat-auth', '')
    if not auth_header:
        return _error_response(401, 'Authorization header not found in HTTP header'), {}

    token = auth_header[len('Bearer '):] if auth_header.startswith('Bearer ') else auth_header

    # Fetch JWT secret from SSM — cached after first (cold-start) call
    if jwt_secret is None:
        proj = os.environ.get('PIKA_SERVICE_PROJ_NAME_KEBAB_CASE', PIKA_SERVICE_PROJ_NAME_KEBAB_CASE)
        stage = os.environ.get('STAGE', STAGE)
        ssm_path = f'/stack/{proj}/{stage}/jwt-secret'
        ssm = boto3.client('ssm')
        jwt_secret = ssm.get_parameter(Name=ssm_path, WithDecryption=True)['Parameter']['Value']

    try:
        decoded: dict = pyjwt.decode(token, jwt_secret, algorithms=['HS256'])
    except pyjwt.exceptions.InvalidTokenError:
        return _error_response(401, 'Unauthorized: Invalid or expired JWT token: code 1B'), {}

    if 'userId' not in decoded:
        return _error_response(401, 'Unauthorized: Invalid or expired JWT token: code 1A'), {}

    # Compare as strings so a JWT-string vs body-int mismatch doesn't 403 spuriously.
    if str(decoded['userId']) != str(body.get('userId') or ''):
        return _error_response(403, 'Forbidden: User ID mismatch'), {}

    return None, decoded


# ---------------------------------------------------------------------------
# Main handler
# ---------------------------------------------------------------------------
# Tag definitions
# ---------------------------------------------------------------------------

TAG_DEFINITIONS_TABLE = os.environ.get('TAG_DEFINITIONS_TABLE', '')
SEMANTIC_DIRECTIVE_TABLE = os.environ.get('SEMANTIC_DIRECTIVE_TABLE', '')


def fetch_tag_definitions(chat_app_id: str, agent_def: dict, request_features: dict | None = None) -> list[dict]:
    """Fetch tag definitions from DynamoDB.

    Matches TS searchTagDefinitions logic:
    - If features.tags.tagsEnabled has items → BatchGetItem for those specific {scope, tag} keys
    - If features.tags.tagsDisabled is empty → include global tags (GSI usage_mode='global')
    - Tags are keyed by {scope, tag}, NOT by chatAppId

    Decision: Direct DDB BatchGetItem + GSI query matching TS chat-admin-ddb.ts.
    Differs from TS: Same query pattern. TS uses DDB Document Client, we use boto3 Table resource.
    """
    global dynamodb
    if dynamodb is None or not TAG_DEFINITIONS_TABLE:
        return []

    table = dynamodb.Table(TAG_DEFINITIONS_TABLE)
    features = request_features or {}
    tags_config = features.get('tags') or {}
    tags_enabled = tags_config.get('tagsEnabled') or []
    tags_disabled = tags_config.get('tagsDisabled') or []

    results = []

    # Mode 1: Fetch specific desired tags via BatchGetItem
    if tags_enabled:
        try:
            keys = [{'scope': t['scope'], 'tag': t['tag']} for t in tags_enabled if 'scope' in t and 'tag' in t]
            if keys:
                response = dynamodb.batch_get_item(
                    RequestItems={TAG_DEFINITIONS_TABLE: {'Keys': keys}}
                )
                items = response.get('Responses', {}).get(TAG_DEFINITIONS_TABLE, [])
                results.extend(items)
        except Exception as e:
            logger.warning(f"Failed to BatchGetItem for desired tags: {e}")

    # Include global tags if no tags are disabled
    if not tags_disabled:
        try:
            response = table.query(
                IndexName='scope-status-index',
                KeyConditionExpression='usage_mode = :mode',
                ExpressionAttributeValues={':mode': 'global'},
            )
            results.extend(response.get('Items', []))
        except Exception as e:
            logger.warning(f"Failed to fetch global tags: {e}")

    return results


def _filter_tags(tag_defs: list[dict], agent_def: dict) -> list[dict]:
    """Filter tag definitions: keep only enabled, exclude agent-disabled tags."""
    disabled_tags = set()
    for dt in agent_def.get('tags_disabled', []):
        disabled_tags.add((dt.get('scope', ''), dt.get('tag', '')))

    return [
        t for t in tag_defs
        if t.get('status') == 'enabled'
        and (t.get('scope', ''), t.get('tag', '')) not in disabled_tags
    ]


def _build_tag_instructions(tag_defs: list[dict]) -> str:
    """Build combined instruction text from tag definitions.

    DDB stores instructions in 'llm_instructions_md' (snake_case).
    Contract tests mock with 'instructions' for simplicity.
    Check both fields for compatibility.
    """
    instructions = []
    for t in tag_defs:
        instr = t.get('llm_instructions_md') or t.get('instructions') or ''
        if instr:
            instructions.append(instr)
    return '\n\n'.join(instructions)


# ---------------------------------------------------------------------------
# Semantic directives / instruction augmentation
# ---------------------------------------------------------------------------

def search_semantic_directives(agent_id: str, chat_app_id: str, entity_id: str | None = None,
                               tool_ids: list[str] | None = None) -> list[dict]:
    """Search for semantic directives matching the given scopes.

    Queries DDB by scope keys: agent#{agentId}, chatapp#{chatAppId},
    tool#{toolId}, entity#{entityId}, agent#{agentId}#entity#{entityId}.
    Decision: Direct DDB query matching TS's searchByScopes pattern.
    Differs from TS: Same query pattern. TS uses pRetry for DDB throttle resilience;
    we rely on boto3's built-in retry config.
    """
    global dynamodb
    if dynamodb is None or not SEMANTIC_DIRECTIVE_TABLE:
        return []

    table = dynamodb.Table(SEMANTIC_DIRECTIVE_TABLE)

    # Build scope keys matching TS constructScope() pattern
    scope_keys = []
    if agent_id:
        scope_keys.append(f'agent#{agent_id}')
    if chat_app_id:
        scope_keys.append(f'chatapp#{chat_app_id}')
    if tool_ids:
        for tid in tool_ids:
            scope_keys.append(f'tool#{tid}')
    if entity_id:
        scope_keys.append(f'entity#{entity_id}')
    if agent_id and entity_id:
        scope_keys.append(f'agent#{agent_id}#entity#{entity_id}')

    if not scope_keys:
        return []

    results = []
    for scope_key in scope_keys:
        try:
            response = table.query(
                KeyConditionExpression='#s = :scope',
                ExpressionAttributeNames={'#s': 'scope'},
                ExpressionAttributeValues={':scope': scope_key},
                ScanIndexForward=False,
                Limit=20,
            )
            results.extend(response.get('Items', []))
        except Exception as e:
            logger.warning(f"Failed to query directives for scope {scope_key}: {e}")

    return results


NOVA_LITE_MODEL_ID = os.environ.get('NOVA_LITE_MODEL_ID', 'amazon.nova-lite-v1:0')


def _get_bedrock_client():
    """Return the module-level bedrock-runtime client, initializing if needed.

    Shared across converse, verification, title generation, and directive filtering.
    """
    global bedrock_runtime
    if bedrock_runtime is None:
        bedrock_runtime = boto3.client('bedrock-runtime')
    return bedrock_runtime


def invoke_llm_for_directive_filter(directives: list[dict], message: str) -> str:
    """Use Amazon Nova Lite to filter directives by relevance to the message.

    Builds the same prompt as TS instruction-augmentation.ts: each directive as
    <instruction><id>...</id><description>...</description></instruction>,
    asks the LLM to return applicable IDs as a JSON array in <answer></answer> tags.

    Decision: Uses Bedrock InvokeModel with Nova Lite, matching TS exactly.
    Differs from TS: Same model, same prompt template, same response parsing.
    """
    if not directives:
        return '<answer>[]</answer>'

    directives_str = '\n'.join(
        f'<instruction><id>{d.get("id", "")}</id><description>{d.get("description", "")}</description></instruction>'
        for d in directives
    )

    prompt = f"""Given this user query determine if any of the additional instructions need to be applied.

Return only the ids that should be added as a json array inside an <answer></answer> tag, ordered from most relevant to least relevant.  If no instructions apply return an empty array []
Do not include any other text or reasoning.  Just the json array inside the <answer></answer> tag.
<instructions>
{directives_str}
</instructions>

<example_output><answer>["instruction-id-1", "instruction-id-2", "instruction-id-3"]</answer></example_output>

<user_query>{message}</user_query>"""

    try:
        client = _get_bedrock_client()
        response = client.invoke_model(
            modelId=NOVA_LITE_MODEL_ID,
            contentType='application/json',
            accept='application/json',
            body=json.dumps({
                'inferenceConfig': {
                    'maxTokens': 2000,
                    'temperature': 1.0,
                    'topK': 128,
                },
                'messages': [
                    {'role': 'user', 'content': [{'text': prompt}]}
                ],
            }),
        )

        response_body = json.loads(response['body'].read())
        # Nova Lite returns output.message.content[0].text
        llm_text = response_body.get('output', {}).get('message', {}).get('content', [{}])[0].get('text', '[]')
        return llm_text

    except Exception as e:
        logger.warning(f"LLM directive filter failed (non-fatal): {e}")
        return '<answer>[]</answer>'


def _resolve_directives(agent_id: str, chat_app_id: str, entity_id: str | None,
                        message: str, features: dict,
                        tool_ids: list[str] | None = None) -> str:
    """Resolve semantic directives and return instruction text to prepend.

    Returns empty string if directive augmentation is disabled or no directives match.
    Errors are caught and logged — directives must never fail the request.

    NOTE: This is the legacy path using Nova Lite LLM filtering (4-6s overhead).
    The preferred path is _build_directive_skills_plugin() which uses Strands Skills
    for progressive disclosure — no LLM call, agent decides what to activate.
    """
    try:
        ia_config = features.get('instructionAugmentation') or features.get('instruction_augmentation') or {}
        if not ia_config.get('enabled', False):
            return ''

        directives = search_semantic_directives(agent_id, chat_app_id, entity_id, tool_ids)
        if not directives:
            return ''

        # Filter by relevance using LLM
        filter_result = invoke_llm_for_directive_filter(directives, message)

        # Parse the answer — extract directive IDs
        match = re.search(r'<answer>\s*(\[.*?\])\s*</answer>', filter_result, re.DOTALL)
        if not match:
            return ''

        selected_ids = json.loads(match.group(1))
        if not isinstance(selected_ids, list):
            return ''
        selected = [d for d in directives if d.get('id') in selected_ids]

        # Build instruction text from selected directives.
        # DDB stores instructions in 'llm_instructions_md'; fall back to 'instructions'.
        instructions = [
            d.get('llm_instructions_md') or d.get('instructions', '')
            for d in selected
            if d.get('llm_instructions_md') or d.get('instructions')
        ]
        return '\n\n'.join(instructions)

    except Exception as e:
        logger.warning(f"Directive resolution error (non-fatal): {e}")
        return ''


def _build_directive_skills_plugin(agent_id: str, chat_app_id: str, entity_id: str | None,
                                   features: dict, tool_ids: list[str] | None = None):
    """Build an AgentSkills plugin from semantic directives.

    Converts DDB directive records into Strands Skills for progressive disclosure.
    The agent sees skill names and descriptions in its system prompt and can call
    the skills() tool to load full instructions on demand — no Nova Lite LLM call needed.

    Returns (AgentSkills_plugin, applied_directives_list) or (None, []).
    The applied_directives list is used to emit a trace matching the TS path format.
    """
    try:
        from strands.vended_plugins.skills import AgentSkills, Skill

        ia_config = features.get('instructionAugmentation') or features.get('instruction_augmentation') or {}
        if not ia_config.get('enabled', False):
            return None, []

        directives = search_semantic_directives(agent_id, chat_app_id, entity_id, tool_ids)
        if not directives:
            return None, []

        skills = []
        applied = []
        for d in directives:
            directive_id = d.get('id', '')
            scope = d.get('scope', '')
            description = d.get('description', '')
            instructions = d.get('llm_instructions_md') or d.get('instructions', '')

            if not directive_id or not instructions:
                continue

            # Sanitize the directive ID for Strands skill name rules:
            # lowercase alphanumeric + hyphens, 1-64 chars, no leading/trailing hyphens
            name = re.sub(r'[^a-z0-9-]', '-', directive_id.lower())
            name = re.sub(r'-+', '-', name).strip('-')[:64]
            if not name:
                continue

            skill = Skill(
                name=name,
                description=description or f'Directive: {directive_id}',
                instructions=instructions,
            )
            skills.append(skill)
            applied.append({
                'scope': scope,
                'id': directive_id,
                'description': description,
                'instructions': instructions,
            })

        if not skills:
            return None, []

        logger.info(f"Built {len(skills)} directive skills for agent")
        return AgentSkills(skills=skills), applied

    except Exception as e:
        logger.warning(f"Failed to build directive skills plugin (non-fatal): {e}")
        return None, []


# ---------------------------------------------------------------------------
# User memory tools (Bedrock AgentCore)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Memory feature prompts — two-layer design
#
# Layer 1 — MEMORY_SYSTEM_PROMPT_ADDITION (appended to system_prompt):
#   A durable capability description telling the agent WHAT the tool does and
#   WHEN to use it. Lives in the system prompt for standing context on every
#   turn. Does NOT carry a per-session imperative — the system prompt is shared
#   across users and cached by Bedrock; per-user injections would bust the cache.
#
# Layer 2 — NEW_SESSION_MEMORY_NUDGE (appended to the first user message only):
#   A lightweight runtime trigger that fires exactly once on the first turn of
#   a new session. Goes in the user message, not the system prompt, so the
#   Bedrock prompt cache is preserved. Ensures the agent retrieves past context
#   before the first response without relying solely on model judgment.
#
# Note on action="record": strands-agents-tools==0.4.1 hardcodes role="ASSISTANT"
# in create_event payloads regardless of content origin. AgentCore's extraction
# pipeline may under-extract or misclassify user preferences stored this way.
# Monitor extracted memory quality; a custom event format may be needed in future.
# ---------------------------------------------------------------------------
MEMORY_SYSTEM_PROMPT_ADDITION = (
    '\n\nYou have access to a memory tool (agent_core_memory) that stores and retrieves context from past '
    'conversations. Use it as follows:\n'
    '- Use action="retrieve" any time past preferences or context would help you give a more '
    'personalized response — especially at the start of a new conversation.\n'
    '- When the user explicitly asks you to remember something (e.g., "remember that I prefer X", '
    '"make a note that...", "don\'t forget..."), immediately call agent_core_memory with action="record" '
    'to save it to long-term memory.\n'
    '- Do not proactively record information unless the user explicitly requests it.'
)

NEW_SESSION_MEMORY_NUDGE = (
    '\n\n[System note: This is the start of a new conversation. '
    'Please use your memory tool to check for any relevant preferences or past context about this user '
    'before responding.]'
)


def _build_memory_tools(memory_feature: dict, user_id: str, session_id: str) -> list:
    """Build memory tools from AgentCoreMemoryToolProvider if memory is enabled.

    Returns a list of tools to add to the agent, or empty list if disabled.
    """
    if not memory_feature.get('enabled'):
        return []

    memory_id = memory_feature.get('memory_id', '')
    if not memory_id:
        return []

    try:
        if AgentCoreMemoryToolProvider is None:
            return []

        provider = AgentCoreMemoryToolProvider(
            memory_id=memory_id,
            actor_id=user_id,
            session_id=session_id,  # used for write-side event correlation; does not scope reads
            # retrieve_memory_records scopes reads to this namespace. Must match the namespace
            # AgentCore uses when extracting memories from recorded events — a mismatch
            # silently returns empty results on every retrieve call.
            namespace=user_id,
        )
        return provider.tools
    except Exception as e:
        logger.warning(f"Failed to build memory tools (non-fatal): {e}")
        return []


# ---------------------------------------------------------------------------
# Swarm result extraction
# ---------------------------------------------------------------------------

def _extract_swarm_response_text(swarm_result) -> str:
    """Extract human-readable response text from a SwarmResult.

    The SwarmResult contains per-node results. We want the text from the last
    completed node's AgentResult message content.
    """
    if swarm_result is None:
        return ''

    try:
        # SwarmResult.results is a dict of {node_id: NodeResult}
        if hasattr(swarm_result, 'results') and isinstance(swarm_result.results, dict):
            # Get the last node in execution order (from node_history if available)
            node_ids = list(swarm_result.results.keys())
            if hasattr(swarm_result, 'node_history') and swarm_result.node_history:
                node_ids = [n.node_id for n in swarm_result.node_history]

            # Iterate in reverse to find the last node with text content
            for node_id in reversed(node_ids):
                node_result = swarm_result.results.get(node_id)
                if node_result is None:
                    continue
                agent_result = getattr(node_result, 'result', None)
                if agent_result is None:
                    continue
                msg = getattr(agent_result, 'message', None)
                if not isinstance(msg, dict):
                    continue
                content = msg.get('content', [])
                if not content:
                    continue
                # Extract text from content blocks
                texts = [block.get('text', '') for block in content if isinstance(block, dict) and block.get('text')]
                if texts:
                    return '\n'.join(texts)

        return str(swarm_result) if swarm_result else ''

    except Exception as e:
        logger.warning(f"Failed to extract Swarm response text: {e}")
        return str(swarm_result) if swarm_result else ''


# ---------------------------------------------------------------------------
# File uploads / S3 validation
# ---------------------------------------------------------------------------

def _validate_and_build_file_info(files: list[dict]) -> tuple[dict | None, str]:
    """Validate S3 file references and build file info string for the agent.

    Returns (error_response, file_info_string):
    - error_response is non-None if any S3 file references an invalid bucket
    - file_info_string is appended to the agent message (empty if no S3 files)

    Only files with locationType='s3' are validated and included.
    """
    if not files:
        return None, ''

    # Fail closed: unset PIKA_S3_BUCKET is a deploy misconfiguration, not a signal
    # to accept any bucket. Without an allowlist we can't safely reference S3 objects.
    allowed_bucket = os.environ.get('PIKA_S3_BUCKET', '')
    if not allowed_bucket:
        logger.error('PIKA_S3_BUCKET env var is unset; rejecting S3 file references')
        return _error_response(500, 'S3 file uploads are not configured for this deployment.'), ''

    s3_keys = []

    for f in files:
        if not f:
            continue
        if f.get('locationType') != 's3':
            continue

        bucket = f.get('s3Bucket', '')
        if bucket != allowed_bucket:
            return _error_response(
                400,
                f"Invalid S3 bucket '{bucket}'. Files must be in bucket '{allowed_bucket}'."
            ), ''

        key = f.get('s3Key', '')
        if key:
            s3_keys.append(key)

    if not s3_keys:
        return None, ''

    file_info = 'Available S3 files:\n' + '\n'.join(f'- s3://{allowed_bucket}/{key}' for key in s3_keys)
    return None, file_info


# ---------------------------------------------------------------------------
# Main handler
# ---------------------------------------------------------------------------

def handler(event, context, chunk_queue: queue.Queue | None = None):
    """Strands converse Lambda handler.

    Accepts the same ConverseRequest body as the TypeScript converse Lambda.
    Streams response chunks to chunk_queue in the wire format:
      plain text | <trace>JSON</trace> | <heartbeat/> | <pika-metadata>JSON</pika-metadata>

    Callers (app.py, local_invoke.py) pass a queue and run this in a background
    thread, consuming chunks as they arrive.  The handler signals completion by
    putting _STREAM_DONE on the queue.

    When chunk_queue is None (test harness), the handler creates an internal
    queue and drains it into the legacy dict format on return.
    """
    _owns_queue = chunk_queue is None
    if _owns_queue:
        chunk_queue = queue.Queue()
    global dynamodb
    if dynamodb is None:
        dynamodb = boto3.resource('dynamodb')
    _get_bedrock_client()

    stream = _StreamWriter(chunk_queue)

    try:
        body = json.loads(event.get('body', '{}'))

        # Cache-clear command — handle before normal flow
        cache_type = body.get('cacheType')
        if cache_type:
            _clear_cache(cache_type, body.get('agentId'))
            resp = {'statusCode': 200, 'headers': {'Content-Type': 'application/json'},
                    'body': json.dumps({'status': 'ok', 'cacheType': cache_type})}
            if _owns_queue:
                return resp
            stream.write(resp['body'])
            stream.end()
            return

        from invocation_mode import (  # noqa: PLC0415
            determine_mode, validate_for_mode, resolve_chat_app_id,
            CHAT_APP_COMPONENT,
        )
        invocation_mode = determine_mode(body)

        agent_id = body.get('agentId')
        session_id = body.get('sessionId')
        user_id = body.get('userId')
        message = body.get('message', '')
        chat_app_id = resolve_chat_app_id(body) or agent_id

        # chat-app-component mode — validate before generic mode validation so
        # the component-specific error message (missing chatAppComponentConfig,
        # etc.) surfaces instead of a generic "chatAppId is required".
        from chat_app_component import (  # noqa: PLC0415
            CHAT_APP_COMPONENT_MODE, validate_chat_app_component_request,
        )
        if invocation_mode == CHAT_APP_COMPONENT_MODE:
            cac_err = validate_chat_app_component_request(body)
            if cac_err is not None:
                resp = _error_response(400, cac_err)
                if _owns_queue:
                    return resp
                stream.write(resp['body'])
                stream.end()
                return

        mode_errors = validate_for_mode(body)
        if mode_errors:
            resp = _error_response(400, '; '.join(mode_errors))
            if _owns_queue:
                return resp
            stream.write(resp['body'])
            stream.end()
            return

        # JWT auth — must succeed before any DDB writes or streaming
        auth_err, jwt_payload = _validate_jwt_auth(event, body)
        if auth_err is not None:
            if _owns_queue:
                return auth_err
            stream.write(auth_err.get('body', ''))
            stream.end()
            return

        # DDB user lookup — separate from JWT validation
        # For JWT path (headers present): 401 if user not found in DDB
        # For local dev (no headers): fall back gracefully with empty user record
        user_record = get_user(dynamodb, CHAT_USER_TABLE, user_id)
        if user_record is None and event.get('headers') is not None:
            resp = _error_response(401, 'User not found')
            if _owns_queue:
                return resp
            stream.write(resp['body'])
            stream.end()
            return

        # Validate file uploads (S3 bucket check)
        files = body.get('files') or []
        file_err, file_info = _validate_and_build_file_info(files)
        if file_err is not None:
            if _owns_queue:
                return file_err
            stream.write(file_err.get('body', ''))
            stream.end()
            return

        # Resolve session_id early so headers can be sent before DDB calls
        if not session_id:
            session_id = str(uuid.uuid7())
        stream.set_headers(session_id)

        user_type = (user_record or {}).get('user_type', 'internal-user')
        ensure_session(dynamodb, CHAT_SESSION_TABLE, user_id, session_id, agent_id, chat_app_id,
                       user_type=user_type)

        # Fetch conversation history BEFORE storing the current user message so
        # the LLM only sees prior turns — not the message it's about to receive.
        _raw_messages = get_messages(dynamodb, CHAT_MESSAGES_TABLE, user_id, session_id)
        if _raw_messages is None:
            logger.warning('get_messages returned None for user=%s session=%s; treating as new session', user_id, session_id)
        _prior_messages_raw = _raw_messages or []

        # Store user message
        user_message_id = f"{session_id}:{_now_ms()}"
        add_message(dynamodb, CHAT_MESSAGES_TABLE, {
            'user_id': user_id,
            'message_id': user_message_id,
            'session_id': session_id,
            'message': message,
            'source': 'user',
            'timestamp': _now_iso(),
        })

        # --- Intent Router — pre-agent command dispatch --------------------
        # Runs before any agent work. Short-circuits the request when the
        # user message matches a tag-defined command (direct/dispatch modes).
        request_features = body.get('features') or {}
        _ir_resolved_mode = invocation_mode
        try:
            import intent_router as _ir  # noqa: PLC0415
        except Exception as _ir_import_err:
            logger.warning(f"Intent router import failed: {_ir_import_err}")
            _ir = None
        if _ir is not None and _ir.should_run(request_features, _ir_resolved_mode):
            _ir_tag_defs = fetch_tag_definitions(chat_app_id, {}, request_features)
            _ir_commands = _ir.get_commands_cached(
                chat_app_id,
                lambda: _ir.load_commands_for_chat_app(
                    chat_app_id, _ir_tag_defs,
                    intent_router_config=request_features.get('intentRouter'),
                ),
            )
            if _ir_commands:
                _ir_threshold = float(
                    (request_features.get('intentRouter') or {}).get('confidenceThreshold')
                    or _ir.DEFAULT_CONFIDENCE_THRESHOLD
                )
                _ir_context = body.get('context') or body.get('routerContext') or {}
                _ir_result = _ir.route(
                    message=message, commands=_ir_commands,
                    confidence_threshold=_ir_threshold, context=_ir_context,
                    bedrock_client=bedrock_runtime,
                )
                # Always emit the router trace so observability captures the decision.
                stream.write_trace(_ir.build_router_trace(_ir_result))

                _ir_early_exit = (
                    _ir_result['type'] == 'dispatch'
                    or (_ir_result['type'] == 'direct' and not _ir_result.get('pass_to_agent'))
                )

                if _ir_result['type'] == 'dispatch':
                    stream.write(_ir.build_dispatch_event(
                        _ir_result, user_message=message, session_id=session_id,
                        user_id=user_id, context=_ir_context,
                    ))
                elif _ir_result['type'] == 'direct':
                    _pika_cmd = _ir_result.get('pika_command') or {}
                    if _pika_cmd:
                        stream.write(_ir.build_command_chunk(_pika_cmd))

                if _ir_result['type'] in ('direct', 'dispatch'):
                    _ir_resp = _ir_result.get('response') or ''
                    if _ir_resp:
                        stream.write(_ir_resp)

                    if _ir_early_exit:
                        # Persist assistant message and end the stream — no Bedrock.
                        _ir_assistant_id = f"{session_id}:{_now_ms()}"
                        try:
                            add_message(dynamodb, CHAT_MESSAGES_TABLE, {
                                'user_id': user_id,
                                'message_id': _ir_assistant_id,
                                'session_id': session_id,
                                'message': _ir_resp,
                                'source': 'assistant',
                                'timestamp': _now_iso(),
                                'execution_duration': 0,
                                'intent_router_handled': True,
                            })
                            update_session(dynamodb, CHAT_SESSION_TABLE, user_id, session_id,
                                           last_message_id=_ir_assistant_id, chat_app_id=chat_app_id)
                        except Exception as _save_err:
                            logger.warning(f"Intent router message save failed: {_save_err}")

                        _ir_metadata = {
                            'userMessageId': user_message_id,
                            'assistantMessageId': _ir_assistant_id,
                            'sessionLastUpdate': datetime.now(timezone.utc).isoformat(),
                            'sessionLastMessageId': _ir_assistant_id,
                            'intentRouterHandled': True,
                        }
                        stream.write(f'<pika-metadata>{json.dumps(_ir_metadata)}</pika-metadata>')
                        stream.end()
                        if _owns_queue:
                            return _drain_queue_to_response(chunk_queue, session_id)
                        return
                    # pass_to_agent=True — fall through to normal agent flow.

        # Load agent definition — check cache first
        agent_def = _get_cached_agent(agent_id)
        if agent_def is None:
            agent_def = load_agent(dynamodb, agent_id)
            _put_cached_agent(agent_id, agent_def)
        model_id = agent_def.get('foundation_model', DEFAULT_MODEL_ID)
        system_prompt = agent_def.get('base_prompt', f'You are a helpful assistant. Agent ID: {agent_id}')
        tool_ids = agent_def.get('tool_ids', [])

        # chat-app-component mode: override system_prompt from tag def's component instructions.
        # Must happen AFTER base_prompt is pulled so the override fully replaces it.
        if invocation_mode == CHAT_APP_COMPONENT_MODE:
            from chat_app_component import (  # noqa: PLC0415
                build_component_system_prompt, fetch_tag_definition,
                resolve_component_instructions,
            )
            cac_cfg = body.get('chatAppComponentConfig') or {}
            cac_tag = cac_cfg.get('componentTagDefinition') or {}
            cac_tag_def = fetch_tag_definition(scope=cac_tag.get('scope'), tag=cac_tag.get('tag'))
            cac_resolved = resolve_component_instructions(
                cac_tag_def, instruction_name=cac_cfg.get('componentAgentInstructionName'),
            )
            if cac_resolved is None:
                resp = _error_response(
                    400,
                    f"component instruction '{cac_cfg.get('componentAgentInstructionName')}' "
                    f"not found in tag {cac_tag.get('scope')}/{cac_tag.get('tag')}",
                )
                if _owns_queue:
                    return resp
                stream.write(resp['body'])
                stream.end()
                return
            system_prompt = build_component_system_prompt(agent_def, cac_resolved)

        # Build custom_data from user record
        user_record_dict = user_record if isinstance(user_record, dict) else {}
        custom_data = user_record_dict.get('custom_data') or {}
        if not isinstance(custom_data, dict):
            custom_data = {}

        # JWT customUserData overrides DDB custom_data when keys conflict.
        # For local dev (no JWT), fall back to body.customUserData.
        if jwt_payload:
            jwt_custom = jwt_payload.get('customUserData') or {}
            if isinstance(jwt_custom, dict):
                custom_data = {**custom_data, **jwt_custom}
        else:
            body_custom = body.get('customUserData') or {}
            if isinstance(body_custom, dict):
                custom_data = {**custom_data, **body_custom}

        # All session attribute values must be strings (Bedrock requirement)
        custom_data_str = {k: str(v) for k, v in custom_data.items() if isinstance(v, (str, int, float, bool))}

        current_date = datetime.now(timezone.utc).isoformat()

        # Mirror the TypeScript sessionAttributes shape (bedrock-agent.ts ~line 1171)
        session_attributes = {
            **custom_data_str,
            'userId': user_id,
            'chatAppId': chat_app_id,
            'agentId': agent_id,
            'currentDate': current_date,
        }

        # Mirror the TypeScript promptSessionAttributes shape (bedrock-agent.ts ~line 1099)
        prompt_session_attributes = {
            **custom_data_str,
            'userId': user_id,
            'currentDate': current_date,
            'messageId': user_message_id,
        }

        # Fetch and filter tag definitions; instructions flow through the
        # instruction-assistance pipeline when the feature is enabled so base
        # prompts with {{prompt-assistance}} / {{tag-instructions}} placeholders
        # get populated correctly (mirrors TS applyInstructionAssistance).
        tag_defs = fetch_tag_definitions(chat_app_id, agent_def, request_features)
        filtered_tags = _filter_tags(tag_defs, agent_def)
        tag_instructions = _build_tag_instructions(filtered_tags)

        # Distinguish "feature absent" (request didn't go through the frontend
        # site-features pipeline, e.g. direct-invoke / test harness) from
        # "feature explicitly set". When absent, fall through to the legacy
        # append-tag-instructions behavior for back-compat. When set (even with
        # enabled=False), honor the explicit configuration via the pipeline.
        ia_feature = request_features.get('agentInstructionAssistance')
        if ia_feature is None:
            if tag_instructions:
                system_prompt = f"{system_prompt}\n\n{tag_instructions}"
        else:
            try:
                from instruction_assistance import (  # noqa: PLC0415
                    load_instruction_assistance_config,
                    generate_instruction_assistance_content,
                    apply_instruction_assistance,
                )
                ia_config = load_instruction_assistance_config()
                ia_content = generate_instruction_assistance_content(
                    ia_config, ia_feature, tag_instructions,
                )
                system_prompt = apply_instruction_assistance(system_prompt, ia_content)
            except Exception as ia_err:
                # Never fail the request over instruction assistance. If
                # something goes wrong, fall back to appending tag instructions
                # so directive/tag guidance still reaches the model.
                logger.warning(f"Instruction assistance failed (non-fatal): {ia_err}")
                if tag_instructions:
                    system_prompt = f"{system_prompt}\n\n{tag_instructions}"

        # Resolve semantic directives — use Strands Skills for progressive disclosure
        # instead of the Nova Lite LLM filter (saves 4-6s per request).
        # Skills inject directive names/descriptions into the system prompt; the agent
        # calls skills() to load full instructions on demand.
        entity_attr_name = body.get('entityAttributeNameInUserCustomData', '')
        entity_id = custom_data_str.get(entity_attr_name) if entity_attr_name else None
        ia_feature = (request_features.get('instructionAugmentation') or
                      request_features.get('instruction_augmentation') or {})
        logger.info(f"Instruction augmentation: enabled={ia_feature.get('enabled')}, features_keys={list(request_features.keys())}")
        directive_skills_plugin, applied_directives = _build_directive_skills_plugin(
            agent_id, chat_app_id, entity_id, request_features,
            tool_ids=tool_ids,
        )
        logger.info(f"Directive skills plugin: {'built' if directive_skills_plugin else 'None (disabled or no directives)'}")
        # Emit directive trace matching the TS path format so the frontend
        # renders "Applied Semantic Directives" in Answer Reasoning
        if applied_directives:
            stream.write_trace({"orchestrationTrace": {"rationale": {"traceId": "semantic-directives", "text": json.dumps({"type": "semantic-directives", "directives": applied_directives})}}})
        # Legacy path: fall back to Nova Lite LLM filter if skills plugin failed
        directive_instructions = ''
        if directive_skills_plugin is None:
            directive_instructions = _resolve_directives(
                agent_id, chat_app_id, entity_id, message, request_features,
                tool_ids=tool_ids,
            )

        # Convert history (fetched before storing current message) to Strands format
        repaired_messages = fix_turn_taking_errors(_prior_messages_raw)
        strands_messages = [
            {'role': msg['source'], 'content': [{'text': str(msg.get('message') or '')}]}
            for msg in repaired_messages
            if msg.get('source') in ('user', 'assistant')
        ]

        # Build Strands tools from tool definitions
        strands_tools = []
        if tool_ids:
            tool_defs = load_tools(dynamodb, tool_ids)
            strands_tools = build_strands_tools(
                tool_defs, session_id, message,
                session_attributes=session_attributes,
                prompt_session_attributes=prompt_session_attributes,
                trace_callback=stream.write_tool_result_trace,
            )

        # Add knowledge base retrieve tools
        knowledge_bases = agent_def.get('knowledge_bases') or []
        uri_map: dict = {}
        if knowledge_bases:
            from kb_retrieve import build_retrieve_kb_tools  # noqa: PLC0415
            kb_tools = build_retrieve_kb_tools(knowledge_bases, custom_data_str, uri_map)
            strands_tools.extend(kb_tools)

        # Add user memory tools if enabled
        memory_feature = agent_def.get('memory_feature') or {}
        memory_tools = _build_memory_tools(memory_feature, user_id, session_id)
        _memory_is_new_session = False
        if memory_tools:
            strands_tools.extend(memory_tools)
            system_prompt += MEMORY_SYSTEM_PROMPT_ADDITION
            _memory_is_new_session = _prior_messages_raw == []

        # Configure Strands agent
        model = BedrockModel(
            model_id=model_id,
            max_tokens=64000,
            cache_config=CacheConfig(strategy="auto"),
        )

        # Time budget: stop agent loop before Lambda times out
        stop_event = threading.Event()
        remaining_ms = context.get_remaining_time_in_millis() if context else 300000
        budget_seconds = max(1, (remaining_ms / 1000) - LAMBDA_TIMEOUT_BUFFER_SECONDS)
        timer = threading.Timer(budget_seconds, stop_event.set)
        timer.daemon = True
        timer.start()

        heartbeat = _Heartbeat(stream)
        heartbeat.start()

        start_time = time.time()
        response_text = ''
        agent_result = None  # Captured for usage extraction
        swarm_cache_read = 0  # Cache tokens accumulated from Swarm per-node events
        swarm_cache_write = 0

        try:
            # Build the agent message: user instruction + directive instructions + message
            user_instruction = ''
            instruction_config = (user_record_dict.get('features') or {}).get('instruction') or {}
            if isinstance(instruction_config, dict):
                user_instruction = instruction_config.get('instruction', '')

            parts = []
            if user_instruction:
                parts.append(user_instruction)
            if directive_instructions:
                parts.append(directive_instructions)
            parts.append(message)
            if file_info:
                parts.append(file_info)
            agent_message = '\n\n'.join(parts)

            # Appended to the user turn rather than the system prompt to preserve system-prompt
            # cache hit rate — the system prompt is shared across users; per-session content
            # there would bust the Bedrock prompt cache for every user.
            # Side effect: the nudge is stored as part of the user turn in DynamoDB and will
            # appear in retrieved history, debug sessions, and analytics/fine-tuning data.
            # Note: on new sessions this adds a synchronous AgentCore retrieve round-trip
            # (p99 ~800ms) before the agent responds; current buffer=30s (LAMBDA_TIMEOUT_BUFFER_SECONDS)
            # — review if retrieve latency data shows budget exhaustion.
            if _memory_is_new_session:
                agent_message += NEW_SESSION_MEMORY_NUDGE

            # Inject context items if provided
            llm_context_items = body.get('llmContextItems') or []
            context_xml = build_context_xml(llm_context_items)
            if context_xml:
                agent_message = f'{agent_message}\n\n{context_xml}'

            # llm-instruction debug trace — emit BEFORE agent execution so it
            # appears at the top of Answer Reasoning and is captured on the
            # assistant message for OpenSearch indexing (message-changed Lambda
            # filters by literal `"type":"llm-instruction"` substring).
            try:
                from debug_trace import (  # noqa: PLC0415
                    build_full_instruction, build_llm_instruction_trace,
                )
                # system_prompt already has tag instructions folded in (see above).
                # agent_message already contains user_instruction + directives + message
                # (see composition a few lines up). Pass each component exactly once.
                _llm_inst_supervisor = build_full_instruction(
                    system_prompt=system_prompt,
                    user_message=agent_message,
                )
                stream.write_trace(build_llm_instruction_trace(_llm_inst_supervisor))
            except Exception as _dbg_err:
                logger.warning(f"llm-instruction trace emission failed (non-fatal): {_dbg_err}")

            # Check for collaborators — use Swarm for multi-agent, plain Agent otherwise
            collaborators = agent_def.get('collaborators') or []

            # Build plugins list (directive skills, etc.)
            agent_plugins = [p for p in [directive_skills_plugin] if p is not None]

            if collaborators:
                # Build supervisor agent — callback_handler=None so ALL output goes
                # through stream_async events (no PrintingCallbackHandler side-writes)
                supervisor = Agent(
                    model=model,
                    system_prompt=system_prompt,
                    tools=strands_tools if strands_tools else None,
                    callback_handler=None,
                    messages=strands_messages,
                    state={
                        'session_attributes': session_attributes,
                        'prompt_session_attributes': prompt_session_attributes,
                    },
                    name=agent_id,
                    description=agent_def.get('base_prompt', '')[:100],
                    plugins=agent_plugins if agent_plugins else None,
                )

                # Build collaborator agents — load full definitions from DDB
                collab_agents = []
                for collab in collaborators:
                    collab_id = collab.get('agentId') or collab.get('agent_id', '')
                    collab_instruction = collab.get('instruction', '')

                    # Load full collaborator agent definition
                    try:
                        collab_def = _get_cached_agent(collab_id)
                        if collab_def is None:
                            collab_def = load_agent(dynamodb, collab_id)
                            _put_cached_agent(collab_id, collab_def)
                    except Exception as e:
                        logger.warning(f"Failed to load collaborator {collab_id}: {e}")
                        continue

                    collab_model_id = collab_def.get('foundation_model', model_id)
                    collab_prompt = collab_def.get('base_prompt', collab_instruction)
                    collab_tool_ids = collab_def.get('tool_ids', [])

                    collab_model = BedrockModel(
                        model_id=collab_model_id,
                        max_tokens=64000,
                        cache_config=CacheConfig(strategy="auto"),
                    )

                    # Build collaborator tools
                    collab_tools = []
                    if collab_tool_ids:
                        collab_tool_defs = load_tools(dynamodb, collab_tool_ids)
                        collab_tools = build_strands_tools(
                            collab_tool_defs, session_id, message,
                            session_attributes=session_attributes,
                            prompt_session_attributes=prompt_session_attributes,
                            trace_callback=stream.write_tool_result_trace,
                        )

                    # Build directive skills plugin for this collaborator
                    collab_skills_plugin, collab_applied_directives = _build_directive_skills_plugin(
                        collab_id, chat_app_id, entity_id, request_features,
                        tool_ids=collab_tool_ids,
                    )
                    collab_plugins = [p for p in [collab_skills_plugin] if p is not None]
                    if collab_applied_directives:
                        stream.write_trace({"orchestrationTrace": {"rationale": {"traceId": f"semantic-directives-collaborator-{collab_id}", "text": json.dumps({"type": "semantic-directives-collaborator", "collaboratorAgentId": collab_id, "directives": collab_applied_directives})}}})

                    collab_agent = Agent(
                        model=collab_model,
                        system_prompt=collab_prompt,
                        tools=collab_tools if collab_tools else None,
                        callback_handler=None,
                        name=collab_id,
                        description=collab_instruction,
                        plugins=collab_plugins if collab_plugins else None,
                    )
                    collab_agents.append(collab_agent)

                    # llm-instruction trace for this collaborator
                    try:
                        from debug_trace import (  # noqa: PLC0415
                            build_full_instruction, build_llm_instruction_trace,
                        )
                        _llm_inst_collab = build_full_instruction(
                            system_prompt=collab_prompt,
                            user_message=agent_message,
                        )
                        stream.write_trace(build_llm_instruction_trace(
                            _llm_inst_collab,
                            trace_id=f'llm-instruction-collaborator-{collab_id}',
                        ))
                    except Exception as _dbg_err:
                        logger.warning(f"collab llm-instruction trace emission failed: {_dbg_err}")

                # Create Swarm with supervisor as entry point
                swarm = Swarm(
                    nodes=[supervisor] + collab_agents,
                    entry_point=supervisor,
                    max_handoffs=20,
                    execution_timeout=float(budget_seconds),
                )

                # Run Swarm with streaming — process events and write to stream
                swarm_final_result = None  # Captured from multiagent_result event
                # Swarm._accumulate_metrics only copies inputTokens/outputTokens/totalTokens,
                # dropping cacheReadInputTokens and cacheWriteInputTokens. We accumulate
                # cache tokens manually from per-node AgentResult.metrics.accumulated_usage.
                swarm_cache_read = 0
                swarm_cache_write = 0

                async def _run_swarm_streaming():
                    """Run Swarm async and process stream events through our pipeline.

                    All intermediate text (supervisor delegation, collaborator thinking) is
                    emitted as rationale traces — matching the TS/Bedrock path where only the
                    final composed answer appears in the response. The actual answer is
                    extracted from the SwarmResult after all nodes complete.
                    """
                    nonlocal swarm_final_result, swarm_cache_read, swarm_cache_write
                    node_text_buffers: dict[str, list[str]] = {}  # per-node text accumulation

                    async for event in swarm.stream_async(agent_message):
                        event_type = event.get('type', '')

                        if event_type == 'multiagent_node_stream':
                            node_id = event.get('node_id', '')
                            agent_event = event.get('event', {})

                            # Buffer text per-node — don't stream to user yet.
                            # All intermediate text becomes traces; only the final
                            # composed answer (from SwarmResult) goes to the user.
                            data = agent_event.get('data', '')
                            if data and node_id:
                                if node_id not in node_text_buffers:
                                    node_text_buffers[node_id] = []
                                node_text_buffers[node_id].append(data)

                            # Tool call traces (invocationInput + observation) are emitted
                            # from agent_loader.py tool wrappers to keep them paired.

                        elif event_type == 'multiagent_node_stop':
                            node_id = event.get('node_id', '?')
                            node_result = event.get('node_result')
                            if node_result:
                                node_usage = getattr(node_result, 'accumulated_usage', {})
                                swarm_cache_read += node_usage.get('cacheReadInputTokens', 0)
                                swarm_cache_write += node_usage.get('cacheWriteInputTokens', 0)
                                logger.info(f"Swarm node '{node_id}' usage: {node_usage}")

                            # Emit buffered text as a rationale trace (thinking/delegation)
                            buffered = ''.join(node_text_buffers.get(node_id, []))
                            if buffered.strip():
                                label = 'Supervisor' if node_id == agent_id else node_id
                                stream.write_trace({
                                    'orchestrationTrace': {
                                        'rationale': {
                                            'traceId': f'agent-thinking-{node_id}',
                                            'text': f'[{label}] {buffered.strip()}',
                                        }
                                    }
                                })

                            # Emit collaborator invocation/output traces
                            if node_id != agent_id:
                                stream.write_trace({
                                    'orchestrationTrace': {
                                        'observation': {
                                            'agentCollaboratorInvocationOutput': {
                                                'output': {'text': buffered.strip() if buffered.strip() else '(completed)'},
                                                'agentCollaboratorName': node_id,
                                            },
                                            'type': 'AGENT_COLLABORATOR',
                                        }
                                    }
                                })

                        elif event_type == 'multiagent_result':
                            swarm_final_result = event.get('result')
                            if swarm_final_result:
                                logger.info(f"SwarmResult accumulated_usage: {getattr(swarm_final_result, 'accumulated_usage', {})}")

                    # Extract the final composed answer from the SwarmResult.
                    # This is the last collaborator's actual response text —
                    # not the intermediate thinking/delegation text.
                    final_answer = _extract_swarm_response_text(swarm_final_result)
                    if final_answer:
                        if uri_map:
                            from kb_citations import inject_citations  # noqa: PLC0415
                            final_answer = inject_citations(final_answer, uri_map)
                        stream.write(final_answer)
                    return final_answer

                # Track whether the async path COMPLETED (no exception) —
                # we must not re-run the Swarm just because a legitimate turn
                # produced empty text (e.g., tool-only turn with no final
                # natural-language response).
                swarm_async_completed = False
                try:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        response_text = loop.run_until_complete(_run_swarm_streaming())
                        swarm_async_completed = True
                        if swarm_final_result is not None:
                            agent_result = swarm_final_result
                    finally:
                        loop.close()
                except Exception as swarm_err:
                    logger.warning(f"Swarm stream_async failed, falling back to sync: {swarm_err}")

                # Fallback only when the async path raised. A legitimately
                # empty response is not a failure.
                if not swarm_async_completed:
                    swarm_result = swarm(agent_message)
                    agent_result = swarm_result
                    response_text = _extract_swarm_response_text(swarm_result)
                    if response_text:
                        if uri_map:
                            from kb_citations import inject_citations  # noqa: PLC0415
                            response_text = inject_citations(response_text, uri_map)
                        stream.write(response_text)

            else:
                # Plain agent — no collaborators.
                # When KB tools are active, citation markers ([[kbref:N]])
                # must be rendered into [Citation N](uri) before the client
                # sees them. The live callback streams raw tokens as they
                # arrive, which would leak the markers. Suppress it and
                # buffer the full turn so we can render once at the end.
                _plain_callback = None if knowledge_bases else _make_callback(stream)
                agent = Agent(
                    model=model,
                    system_prompt=system_prompt,
                    tools=strands_tools if strands_tools else None,
                    callback_handler=_plain_callback,
                    messages=strands_messages,
                    state={
                        'session_attributes': session_attributes,
                        'prompt_session_attributes': prompt_session_attributes,
                    },
                    plugins=agent_plugins if agent_plugins else None,
                )

                result = agent(
                    agent_message,
                    invocation_state={
                        'max_iterations': MAX_ITERATIONS,
                        'stop_event': stop_event,
                    },
                )
                agent_result = result
                response_text = str(result) if result else ''
                if uri_map:
                    from kb_citations import inject_citations  # noqa: PLC0415
                    response_text = inject_citations(response_text, uri_map)
                # For KB agents the live callback was suppressed, so the
                # client has seen nothing yet — stream the rendered text
                # once, in one shot. Non-KB agents already streamed via
                # the callback; skip to avoid duplication.
                if knowledge_bases and response_text:
                    stream.write(response_text)
        except MaxTokensReachedException as e:
            logger.error(f"Agent execution error: {e}")
            response_text = "I'm sorry, your request required more processing than I can handle in a single response. Try breaking it into smaller steps or simplifying your request."
            stream.write(response_text)
        except Exception as e:
            logger.error(f"Agent execution error: {e}")
            response_text = "I'm sorry, I encountered an error processing your request."
            stream.write(response_text)
        finally:
            heartbeat.stop()
            timer.cancel()

        execution_duration = int((time.time() - start_time) * 1000)

        # Extract usage from Strands result (includes cache tokens).
        # For Swarm: SwarmResult.accumulated_usage drops cache tokens (SDK limitation),
        # so we use swarm_cache_read/swarm_cache_write accumulated from per-node events.
        full_usage = extract_full_usage(agent_result)
        input_tokens = full_usage.get('inputTokens', 0)
        output_tokens = full_usage.get('outputTokens', 0)
        cache_read_tokens = full_usage.get('cacheReadInputTokens', 0) or swarm_cache_read
        cache_write_tokens = full_usage.get('cacheWriteInputTokens', 0) or swarm_cache_write
        logger.info(
            f"Usage: input={input_tokens}, output={output_tokens}, "
            f"cacheRead={cache_read_tokens}, cacheWrite={cache_write_tokens}"
        )
        usage = calculate_usage(input_tokens, output_tokens, model_id,
                                cache_read_tokens=cache_read_tokens,
                                cache_write_tokens=cache_write_tokens)

        # Verification — classify response accuracy if enabled
        verifications = None
        verify_config = agent_def.get('verification') or {}
        features = body.get('features') or {}
        verify_feature = features.get('verifyResponse') or {}
        verify_enabled = verify_config.get('enabled') or verify_feature.get('enabled')
        logger.info(f"Verification: enabled={verify_enabled}, agent_config={bool(verify_config.get('enabled'))}, feature={bool(verify_feature.get('enabled'))}")
        if verify_enabled:
            try:
                v_result = verify_response(message, response_text, bedrock_runtime)
                logger.info(f"Verification result: {v_result.get('classification', 'U')}")
                verifications = {'main': v_result.get('classification', 'U')}

                reprompt_text = get_reprompt_for_classification(v_result.get('classification', 'U'))
                if reprompt_text:
                    reprompt_msg = build_reprompt_message(reprompt_text, v_result.get('explanation', ''))
                    # Re-run agent with reprompt
                    try:
                        correction_result = agent(
                            reprompt_msg,
                            invocation_state={'max_iterations': MAX_ITERATIONS, 'stop_event': stop_event},
                        ) if not collaborators else None
                        if correction_result:
                            correction_text = str(correction_result)
                            stream.write(correction_text)
                            response_text += correction_text
                            # Re-verify the corrected response
                            c_result = verify_response(message, response_text, bedrock_runtime)
                            verifications['correction'] = c_result.get('classification', 'U')
                            # Update usage with correction tokens
                            corr_usage = extract_full_usage(correction_result)
                            input_tokens += corr_usage.get('inputTokens', 0)
                            output_tokens += corr_usage.get('outputTokens', 0)
                            cache_read_tokens += corr_usage.get('cacheReadInputTokens', 0)
                            cache_write_tokens += corr_usage.get('cacheWriteInputTokens', 0)
                            usage = calculate_usage(input_tokens, output_tokens, model_id,
                                                    cache_read_tokens=cache_read_tokens,
                                                    cache_write_tokens=cache_write_tokens)
                    except Exception as corr_err:
                        logger.warning(f"Correction reprompt failed: {corr_err}")
            except Exception as verify_err:
                logger.warning(f"Verification failed: {verify_err}")

        # Store assistant message
        assistant_message_id = f"{session_id}:{_now_ms()}"
        assistant_msg = {
            'user_id': user_id,
            'message_id': assistant_message_id,
            'session_id': session_id,
            'message': response_text,
            'source': 'assistant',
            'model': model_id,
            'timestamp': _now_iso(),
            'execution_duration': execution_duration,
            'usage': usage,
        }
        if verifications:
            assistant_msg['verifications'] = verifications
        if stream.traces:
            assistant_msg['traces'] = stream.traces
        # The response has already streamed to the client. A DDB throttle here
        # means the user saw the message but it was never persisted. Log the
        # full payload so it can be reconstructed from CloudWatch if needed,
        # and keep going so title generation still fires.
        try:
            add_message(dynamodb, CHAT_MESSAGES_TABLE, assistant_msg)
        except Exception as e:
            logger.exception(
                f"Failed to persist assistant message "
                f"user={user_id} session={session_id} msg={assistant_message_id}: {e}"
            )

        # Update session — last_message_id, last_update, chat_app_sk, usage counters.
        # This mirrors updateSession() in chat-ddb.ts and is required for the
        # user-chat-app-index GSI to sort sessions by recency.
        try:
            update_session(dynamodb, CHAT_SESSION_TABLE, user_id, session_id,
                           assistant_message_id, usage=usage,
                           chat_app_id=chat_app_id, source='user')
        except Exception as e:
            logger.exception(
                f"Failed to update session after streaming "
                f"user={user_id} session={session_id}: {e}"
            )

        # Title generation — only for untitled sessions
        session_table = dynamodb.Table(CHAT_SESSION_TABLE)
        try:
            session_record = session_table.get_item(
                Key={'user_id': user_id, 'session_id': session_id}
            ).get('Item', {})
            existing_title = session_record.get('title')
            if not existing_title:
                try:
                    title = generate_session_title(message, response_text, bedrock_runtime)
                    logger.info(f"Title generated: '{title}'")
                    session_table.update_item(
                        Key={'user_id': user_id, 'session_id': session_id},
                        UpdateExpression='SET title = :t',
                        ExpressionAttributeValues={':t': title},
                    )
                except Exception as title_err:
                    logger.warning(f"Title generation failed: {title_err}")
            else:
                logger.info(f"Title already exists: '{existing_title}' — skipping generation")
        except Exception as sess_err:
            logger.warning(f"Session lookup for title failed: {sess_err}")

        # Session insights — track sent context items
        if llm_context_items:
            try:
                sent_contexts = {}
                msg_ids = [user_message_id, assistant_message_id]
                for item in llm_context_items:
                    record = build_sent_context_record(item, msg_ids)
                    sent_contexts[item.get('id', '')] = record
                update_session_sent_contexts(dynamodb, CHAT_SESSION_TABLE, user_id, session_id, sent_contexts)
            except Exception as ctx_err:
                logger.warning(f"Session insights update failed: {ctx_err}")

        # Final frame: pika-metadata — must match the TypeScript converse Lambda shape
        # (services/pika/src/lambda/converse/index.ts) so the frontend can handle both paths.
        session_last_update = datetime.now(timezone.utc).isoformat()
        metadata = {
            'userMessageId': user_message_id,
            'assistantMessageId': assistant_message_id,
            'sessionLastUpdate': session_last_update,
            'sessionLastMessageId': assistant_message_id,
        }
        stream.write(f'<pika-metadata>{json.dumps(metadata)}</pika-metadata>')
        stream.end()

        if _owns_queue:
            return _drain_queue_to_response(chunk_queue, session_id)

    except Exception as e:
        logger.error(f"Handler error: {e}", exc_info=True)
        stream.write(json.dumps({'error': str(e)}))
        stream.end()
        if _owns_queue:
            return _error_response(500, str(e))
    finally:
        # Close any MCP client sessions opened by this invocation. MCPClient
        # runs a background thread + open HTTP session that stays alive for
        # the agent's tool-calls; we must exit the context before the Lambda
        # returns or the session leaks across warm-container invocations.
        try:
            from mcp_tools import close_mcp_clients  # noqa: PLC0415
            close_mcp_clients()
        except Exception as _mcp_close_err:
            logger.warning(f"MCP client cleanup failed: {_mcp_close_err}")


def fix_turn_taking_errors(messages: list[dict]) -> list[dict]:
    """Repair consecutive same-role messages by inserting synthetic filler turns.

    Mirrors fixTurnTakingErrors() in the TypeScript converse Lambda.
    """
    repaired = []
    for msg in messages:
        if repaired and repaired[-1]['source'] == msg['source']:
            opposite = 'assistant' if msg['source'] == 'user' else 'user'
            repaired.append({
                'source': opposite,
                'message': 'Error in conversation flow',
                'user_id': msg['user_id'],
                'session_id': msg['session_id'],
                'message_id': 'synthetic',
                'timestamp': 0,
            })
        repaired.append(msg)
    return repaired


def _error_response(status_code: int, message: str) -> dict:
    """Build an error dict. Used by _validate_jwt_auth and _validate_and_build_file_info."""
    return {
        'statusCode': status_code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps({'error': message}),
    }


def _drain_queue_to_response(q: queue.Queue, session_id: str) -> dict:
    """Drain a chunk queue into the legacy response dict format for tests."""
    chunks = []
    while True:
        item = q.get()
        if item is _STREAM_DONE:
            break
        # Skip the headers sentinel — the session ID is already in the dict
        if isinstance(item, tuple) and len(item) == 2 and item[0] is _STREAM_HEADERS:
            continue
        chunks.append(item)
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'text/plain',
            'x-chatbot-session-id': session_id,
        },
        'body': ''.join(chunks),
    }


