"""
CONTRACT TESTS: JWT auth and user validation for the Strands converse Lambda.

These tests define the EXPECTED behavior of JWT authentication and are
EXPECTED TO FAIL until JWT auth is implemented in handler.py.

Auth contract (mirrors TypeScript converse Lambda in services/pika/src/lambda/converse/index.ts):

  Header name : x-chat-auth  (lowercase, in event['headers'])
  Token format: raw JWT string or "Bearer <jwt>" (Bearer prefix stripped)
  JWT payload : { "userId": str, "customUserData": dict | None, "iat": int, "exp": int }
  JWT secret  : fetched from SSM at /stack/{PIKA_SERVICE_PROJ_NAME_KEBAB_CASE}/{STAGE}/jwt-secret
  SSM caching : module-level jwt_secret variable — SSM must be called only once per warm container

Validation order (from index.ts and jwt.ts):
  1. Fetch JWT secret from SSM (cold-start only; cache module-level)
  2. Check x-chat-auth header present → 401 if missing
  3. jwt.verify(token, secret) → 401 if bad signature, expired, or no userId field
  4. JWT userId == request body userId → 403 if mismatch
     NOTE: TypeScript path throws UnauthorizedError (401) here; Python contract uses 403
     (Forbidden) to separate authentication failure from authorisation failure.
     See task #3 assignment from team-lead.
  5. DynamoDB user lookup → 401 if user not found

Status codes:
  401 — missing x-chat-auth header          ("Authorization header not found in HTTP header")
  401 — JWT bad signature or malformed      ("Unauthorized: Invalid or expired JWT token: code 1B")
  401 — JWT decoded but no userId field     ("Unauthorized: Invalid or expired JWT token: code 1A")
  401 — expired JWT token                   (caught by jwt.verify, same code 1B path)
  403 — valid JWT but userId != request body userId
  401 — userId not found in DynamoDB        ("User not found")
  200 — valid JWT, matching userId, user exists in DynamoDB

customUserData flow:
  JWT customUserData overrides DDB user.customData when keys conflict.
  Both are merged into session_attributes / prompt_session_attributes passed to build_strands_tools.

Deps: PyJWT>=2.0 (add to test requirements), boto3 (mocked), strands (mocked)
"""

import json
import os
import time
import importlib
import sys
from unittest.mock import MagicMock, patch, call

import pytest

# ---------------------------------------------------------------------------
# PyJWT import — required for generating test tokens
# ---------------------------------------------------------------------------
try:
    import jwt as pyjwt
except ImportError:
    pyjwt = None  # type: ignore[assignment]

pytestmark = pytest.mark.skipif(pyjwt is None, reason='PyJWT is required for auth contract tests (pip install PyJWT)')

# ---------------------------------------------------------------------------
# Test constants
# ---------------------------------------------------------------------------

TEST_JWT_SECRET = 'super-secret-test-key-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
TEST_SSM_PATH = '/stack/ai-bot/test/jwt-secret'
TEST_USER_ID = 'user-abc-123'
TEST_AGENT_ID = 'agent-xyz-001'
TEST_SESSION_ID = 'session-001'
TEST_ACCOUNT_ID = 'acct-99999'


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def _make_valid_token(user_id: str = TEST_USER_ID, custom_user_data: dict | None = None, secret: str = TEST_JWT_SECRET) -> str:
    """Create a signed, non-expired JWT matching the TypeScript payload shape."""
    payload: dict = {'userId': user_id}
    if custom_user_data is not None:
        payload['customUserData'] = custom_user_data
    return pyjwt.encode(payload, secret, algorithm='HS256')


def _make_expired_token(user_id: str = TEST_USER_ID, secret: str = TEST_JWT_SECRET) -> str:
    """Create a JWT whose exp is in the past."""
    payload = {
        'userId': user_id,
        'iat': int(time.time()) - 7200,  # issued 2 hours ago
        'exp': int(time.time()) - 3600,  # expired 1 hour ago
    }
    return pyjwt.encode(payload, secret, algorithm='HS256')


# ---------------------------------------------------------------------------
# Event builder
# ---------------------------------------------------------------------------

def _make_event(user_id: str = TEST_USER_ID,
                agent_id: str = TEST_AGENT_ID,
                session_id: str = TEST_SESSION_ID,
                message: str = 'Hello',
                auth_header: str | None = None,
                include_auth_header: bool = True) -> dict:
    """Build a Lambda event that mirrors the Function URL format used by the handler."""
    headers: dict = {}
    if include_auth_header and auth_header is not None:
        headers['x-chat-auth'] = auth_header

    return {
        'headers': headers,
        'body': json.dumps({
            'agentId': agent_id,
            'userId': user_id,
            'sessionId': session_id,
            'message': message,
        }),
    }


# ---------------------------------------------------------------------------
# Shared mock context
# ---------------------------------------------------------------------------

@pytest.fixture
def fake_context():
    ctx = MagicMock()
    ctx.get_remaining_time_in_millis.return_value = 300_000
    return ctx


# ---------------------------------------------------------------------------
# SSM mock factory
#
# Returns a mock boto3 SSM client whose get_parameter always returns TEST_JWT_SECRET.
# ---------------------------------------------------------------------------

def _make_ssm_client(secret: str = TEST_JWT_SECRET) -> MagicMock:
    ssm = MagicMock()
    ssm.get_parameter.return_value = {
        'Parameter': {'Value': secret}
    }
    return ssm


# ---------------------------------------------------------------------------
# Helper: reload handler with a clean module-level jwt_secret
#
# Because jwt_secret is a module-level variable that gets cached across
# test runs (within the same process), we must reset it to None before each
# test to exercise the "cold start — fetch from SSM" path.
# ---------------------------------------------------------------------------

def _reload_handler():
    """Remove handler from sys.modules so its module-level state is reset."""
    for mod in list(sys.modules.keys()):
        if 'handler' in mod and 'converse_strands' not in mod:
            # Only drop the handler module, not test helpers
            pass
    if 'handler' in sys.modules:
        del sys.modules['handler']


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------

class TestAuthContract:
    """
    CONTRACT tests — these will FAIL until JWT auth is implemented in handler.py.
    Mark each failing test with @pytest.mark.xfail(strict=True) once auth lands
    so CI catches regressions.
    """

    # ------------------------------------------------------------------
    # 1. Missing x-chat-auth header → 401
    # ------------------------------------------------------------------

    def test_missing_auth_header_returns_401(self, fake_context):
        """Handler must return 401 when x-chat-auth header is absent.

        Contract ref: index.ts ~line 149-153
            const authHeader = fnUrlEvent.headers['x-chat-auth'];
            if (!authHeader) throw new UnauthorizedError('Authorization header not found in HTTP header');
        """
        event = _make_event(include_auth_header=False)

        mock_ssm = _make_ssm_client()
        mock_ddb = MagicMock()
        mock_agent_cls = MagicMock()

        with (
            patch('boto3.client', return_value=mock_ssm),
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', mock_agent_cls),
        ):
            import handler  # noqa: PLC0415
            result = handler.handler(event, fake_context)

        assert result is not None, 'Handler must return a response dict (not stream) in buffered mode'
        assert result['statusCode'] == 401, (
            f'Expected 401 for missing x-chat-auth header, got {result["statusCode"]}'
        )

    # ------------------------------------------------------------------
    # 2. Invalid / malformed JWT → 401
    # ------------------------------------------------------------------

    def test_invalid_jwt_returns_401(self, fake_context):
        """Handler must return 401 when the x-chat-auth token cannot be verified.

        Contract ref: index.ts ~line 156-163
            const [simpleUser, error] = extractFromJwtString(authHeader, jwtSecret);
            if (typeof simpleUser === 'number') throw new UnauthorizedError(error);
        """
        event = _make_event(auth_header='this.is.not.a.valid.jwt')

        mock_ssm = _make_ssm_client()
        mock_ddb = MagicMock()
        mock_agent_cls = MagicMock()

        with (
            patch('boto3.client', return_value=mock_ssm),
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', mock_agent_cls),
        ):
            import handler  # noqa: PLC0415
            result = handler.handler(event, fake_context)

        assert result is not None
        assert result['statusCode'] == 401, (
            f'Expected 401 for malformed JWT, got {result["statusCode"]}'
        )

    # ------------------------------------------------------------------
    # 3. Expired JWT → 401
    # ------------------------------------------------------------------

    def test_expired_jwt_returns_401(self, fake_context):
        """Handler must return 401 when the JWT exp claim is in the past.

        Contract ref: jwt.ts ~line 47-49
            } catch (error) {
                return [401, 'Unauthorized: Invalid or expired JWT token: code 1B'];
            }
        """
        expired_token = _make_expired_token()
        event = _make_event(auth_header=expired_token)

        mock_ssm = _make_ssm_client()
        mock_ddb = MagicMock()
        mock_agent_cls = MagicMock()

        with (
            patch('boto3.client', return_value=mock_ssm),
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', mock_agent_cls),
        ):
            import handler  # noqa: PLC0415
            result = handler.handler(event, fake_context)

        assert result is not None
        assert result['statusCode'] == 401, (
            f'Expected 401 for expired JWT, got {result["statusCode"]}'
        )

    # ------------------------------------------------------------------
    # 4. Valid JWT with correct userId → 200
    # ------------------------------------------------------------------

    def test_valid_jwt_matching_user_id_returns_200(self, fake_context):
        """Handler must return 200 when x-chat-auth holds a valid JWT and userId matches the body.

        Contract ref: index.ts ~line 255-258 (userId check must pass), then proceeds to 200.
        """
        valid_token = _make_valid_token(user_id=TEST_USER_ID)
        event = _make_event(user_id=TEST_USER_ID, auth_header=valid_token)

        mock_ssm = _make_ssm_client()
        mock_ddb_resource = MagicMock()
        mock_table = MagicMock()
        mock_ddb_resource.Table.return_value = mock_table
        mock_table.get_item.return_value = {}

        mock_agent_instance = MagicMock()
        mock_agent_instance.return_value = 'Agent response text'
        mock_agent_cls = MagicMock(return_value=mock_agent_instance)

        # load_agent and load_tools must return minimal valid shapes
        mock_load_agent = MagicMock(return_value={'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', 'base_prompt': 'Be helpful', 'tool_ids': []})
        mock_get_user = MagicMock(return_value={'user_id': TEST_USER_ID, 'custom_data': {}})
        mock_get_messages = MagicMock(return_value=[])

        with (
            patch('boto3.client', return_value=mock_ssm),
            patch('boto3.resource', return_value=mock_ddb_resource),
            patch('handler.Agent', mock_agent_cls),
            patch('handler.load_agent', mock_load_agent),
            patch('handler.get_user', mock_get_user),
            patch('handler.get_messages', mock_get_messages),
        ):
            import handler  # noqa: PLC0415
            result = handler.handler(event, fake_context)

        assert result is not None
        assert result['statusCode'] == 200, (
            f'Expected 200 for valid JWT with matching userId, got {result["statusCode"]}'
        )

    # ------------------------------------------------------------------
    # 5. JWT userId doesn't match request userId → 403
    # ------------------------------------------------------------------

    def test_jwt_user_id_mismatch_returns_403(self, fake_context):
        """Handler must return 403 when the JWT userId does not match the request body userId.

        Contract ref: index.ts ~line 255-258
            if (simpleUser.userId !== converseRequest.userId) {
                throw new UnauthorizedError('User ID mismatch');
            }

        NOTE: The TypeScript path throws UnauthorizedError (401) for this case.
        The Python contract intentionally uses 403 (Forbidden) to better distinguish
        authentication failure (401) from authorisation failure (403 — authenticated
        but not allowed to act as a different user).  Align with TypeScript if the
        team decides to keep parity.
        """
        token_for_other_user = _make_valid_token(user_id='different-user-id')
        # Request body userId is TEST_USER_ID — does NOT match the token
        event = _make_event(user_id=TEST_USER_ID, auth_header=token_for_other_user)

        mock_ssm = _make_ssm_client()
        mock_ddb = MagicMock()
        mock_agent_cls = MagicMock()

        with (
            patch('boto3.client', return_value=mock_ssm),
            patch('boto3.resource', return_value=mock_ddb),
            patch('handler.Agent', mock_agent_cls),
        ):
            import handler  # noqa: PLC0415
            result = handler.handler(event, fake_context)

        assert result is not None
        assert result['statusCode'] == 403, (
            f'Expected 403 for JWT/request userId mismatch, got {result["statusCode"]}'
        )

    # ------------------------------------------------------------------
    # 6. customUserData from JWT merged into session_attributes
    # ------------------------------------------------------------------

    def test_custom_user_data_from_jwt_flows_to_build_strands_tools(self, fake_context):
        """Handler must extract customUserData from the JWT and merge it into the
        session_attributes dict passed to build_strands_tools, overriding DDB user.custom_data
        when keys conflict.

        Contract ref:
          - jwt.ts line 42: customUserData = decoded.customUserData
          - bedrock-agent.ts ~line 1099: sessionAttributes = { ...chatSession.sessionAttributes,
              ...simpleUser.customUserData, userId, ... }  ← JWT overrides DDB on conflict
          - handler.py ~line 1134-1143: JWT customUserData merges via {**ddb_custom_data, **jwt_custom}
            (dict-unpack order makes JWT win on key conflict).

        Test setup:
          - DDB user has custom_data = { accountId: 'ddb-account', region: 'us-east-1' }
          - JWT customUserData = { accountId: TEST_ACCOUNT_ID, orgId: 'org-777' }
          - Expected: accountId == TEST_ACCOUNT_ID (JWT wins), orgId == 'org-777' (JWT-only),
            region == 'us-east-1' (DDB-only passthrough).

        Assertion: build_strands_tools is called with session_attributes containing
        the JWT-sourced accountId (not the DDB value), plus passthrough DDB fields.
        """
        ddb_account_id = 'ddb-account'
        jwt_custom_user_data = {'accountId': TEST_ACCOUNT_ID, 'orgId': 'org-777'}
        valid_token = _make_valid_token(user_id=TEST_USER_ID, custom_user_data=jwt_custom_user_data)
        event = _make_event(user_id=TEST_USER_ID, auth_header=valid_token)

        mock_ssm = _make_ssm_client()
        mock_ddb_resource = MagicMock()
        mock_table = MagicMock()
        mock_ddb_resource.Table.return_value = mock_table
        mock_table.get_item.return_value = {}

        mock_agent_instance = MagicMock()
        mock_agent_instance.return_value = 'Agent response'
        mock_agent_cls = MagicMock(return_value=mock_agent_instance)

        mock_load_agent = MagicMock(return_value={
            'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
            'base_prompt': 'Be helpful',
            'tool_ids': ['tool-001'],
        })
        mock_load_tools = MagicMock(return_value=[{'tool_id': 'tool-001', 'name': 'search'}])
        # DDB user has custom_data with conflicting accountId and passthrough region
        mock_get_user = MagicMock(return_value={
            'user_id': TEST_USER_ID,
            'custom_data': {'accountId': ddb_account_id, 'region': 'us-east-1'},
        })

        # Use a MagicMock to stay agnostic to build_strands_tools' exact signature
        # (it takes positional + kw-only args; we inspect call_args either way).
        mock_build_tools = MagicMock(return_value=[])

        with (
            patch('boto3.client', return_value=mock_ssm),
            patch('boto3.resource', return_value=mock_ddb_resource),
            patch('handler.Agent', mock_agent_cls),
            patch('handler.load_agent', mock_load_agent),
            patch('handler.load_tools', mock_load_tools),
            patch('handler.build_strands_tools', mock_build_tools),
            patch('handler.get_user', mock_get_user),
        ):
            import handler  # noqa: PLC0415
            result = handler.handler(event, fake_context)

        assert result is not None and result['statusCode'] == 200
        assert mock_build_tools.called, 'build_strands_tools must be called for an authorized request'

        # Pull session_attributes from the call regardless of whether it was passed
        # positionally or as a keyword.
        call = mock_build_tools.call_args
        session_attrs = call.kwargs.get('session_attributes')
        if session_attrs is None and len(call.args) >= 4:
            session_attrs = call.args[3]
        assert isinstance(session_attrs, dict), (
            f'session_attributes must be a dict; call was {call!r}'
        )

        # JWT customUserData must override DDB custom_data when keys conflict
        assert session_attrs.get('accountId') == TEST_ACCOUNT_ID, (
            f'JWT customUserData.accountId={TEST_ACCOUNT_ID!r} must override DDB value={ddb_account_id!r}. '
            f'Got session_attributes={session_attrs!r}'
        )
        # JWT-only field must be present
        assert session_attrs.get('orgId') == 'org-777', (
            f'Expected orgId="org-777" from JWT customUserData in session_attributes; got {session_attrs!r}'
        )
        # DDB-only field must pass through
        assert session_attrs.get('region') == 'us-east-1', (
            f'Expected region="us-east-1" from DDB custom_data passthrough; got {session_attrs!r}'
        )

    # ------------------------------------------------------------------
    # 6. User not found in DynamoDB → 401
    # ------------------------------------------------------------------

    def test_user_not_found_in_ddb_returns_401(self, fake_context):
        """Handler must return 401 when the userId from the JWT does not exist in the users table.

        Contract ref: index.ts ~line 277-281
            const user = await getUser(converseRequest.userId);
            if (!user) throw new UnauthorizedError('User not found');

        This check happens AFTER the JWT is validated and userId cross-check passes.
        The DynamoDB users table is the authoritative source for whether a user is active.
        """
        valid_token = _make_valid_token(user_id=TEST_USER_ID)
        event = _make_event(user_id=TEST_USER_ID, auth_header=valid_token)

        mock_ssm = _make_ssm_client()
        mock_ddb_resource = MagicMock()
        mock_table = MagicMock()
        mock_ddb_resource.Table.return_value = mock_table
        mock_table.get_item.return_value = {}

        mock_agent_cls = MagicMock()
        mock_load_agent = MagicMock(return_value={
            'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
            'base_prompt': 'Be helpful',
            'tool_ids': [],
        })
        # get_user returns None — user does not exist in DynamoDB
        mock_get_user = MagicMock(return_value=None)

        with (
            patch('boto3.client', return_value=mock_ssm),
            patch('boto3.resource', return_value=mock_ddb_resource),
            patch('handler.Agent', mock_agent_cls),
            patch('handler.load_agent', mock_load_agent),
            patch('handler.get_user', mock_get_user),
        ):
            import handler  # noqa: PLC0415
            result = handler.handler(event, fake_context)

        assert result is not None
        assert result['statusCode'] == 401, (
            f'Expected 401 when userId not found in DynamoDB users table, got {result["statusCode"]}'
        )

    # ------------------------------------------------------------------
    # 7. JWT secret fetched from SSM and cached (not re-fetched on warm calls)
    # ------------------------------------------------------------------

    def test_jwt_secret_fetched_from_ssm_once_and_cached(self, fake_context):
        """SSM get_parameter must be called exactly once across multiple warm handler invocations.

        Contract ref: index.ts ~line 129-133
            if (!jwtSecret) {
                jwtSecret = await getValueFromParameterStore('/stack/.../jwt-secret');
            }

        The Python handler must use a module-level jwt_secret variable so that
        SSM is only called on the first (cold-start) invocation.

        SSM path: /stack/{PIKA_SERVICE_PROJ_NAME_KEBAB_CASE}/{STAGE}/jwt-secret
        """
        os.environ['PIKA_SERVICE_PROJ_NAME_KEBAB_CASE'] = 'ai-bot'
        os.environ['STAGE'] = 'test'

        expected_ssm_path = f'/stack/{os.environ["PIKA_SERVICE_PROJ_NAME_KEBAB_CASE"]}/{os.environ["STAGE"]}/jwt-secret'

        valid_token = _make_valid_token(user_id=TEST_USER_ID)
        event = _make_event(user_id=TEST_USER_ID, auth_header=valid_token)

        mock_ssm = _make_ssm_client()
        mock_ddb_resource = MagicMock()
        mock_table = MagicMock()
        mock_ddb_resource.Table.return_value = mock_table
        mock_table.get_item.return_value = {}

        mock_agent_instance = MagicMock()
        mock_agent_instance.return_value = 'ok'
        mock_agent_cls = MagicMock(return_value=mock_agent_instance)

        mock_load_agent = MagicMock(return_value={
            'foundation_model': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
            'base_prompt': 'Be helpful',
            'tool_ids': [],
        })
        mock_get_user = MagicMock(return_value={'user_id': TEST_USER_ID, 'custom_data': {}})
        mock_get_messages = MagicMock(return_value=[])

        with (
            patch('boto3.client', return_value=mock_ssm),
            patch('boto3.resource', return_value=mock_ddb_resource),
            patch('handler.Agent', mock_agent_cls),
            patch('handler.load_agent', mock_load_agent),
            patch('handler.get_user', mock_get_user),
            patch('handler.get_messages', mock_get_messages),
        ):
            import handler  # noqa: PLC0415

            # Reset the module-level jwt_secret so we start from a "cold" state
            handler.jwt_secret = None  # type: ignore[attr-defined]  # attribute added by auth impl

            # First invocation — should trigger SSM fetch
            handler.handler(event, fake_context)
            # Second invocation — SSM must NOT be called again
            handler.handler(event, fake_context)

        # SSM get_parameter should have been called exactly once, with the correct path
        ssm_calls = mock_ssm.get_parameter.call_args_list
        assert len(ssm_calls) == 1, (
            f'SSM get_parameter called {len(ssm_calls)} times; expected 1 (cached after first call). '
            f'Calls: {ssm_calls}'
        )
        actual_path = ssm_calls[0].kwargs.get('Name') or (ssm_calls[0].args[0] if ssm_calls[0].args else None)
        assert actual_path == expected_ssm_path, (
            f'SSM called with path {actual_path!r}, expected {expected_ssm_path!r}'
        )
