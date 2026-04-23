"""
CONTRACT TESTS: MCP (Model Context Protocol) tool support.

These tests are EXPECTED TO FAIL until MCP tool execution is implemented.

Contract: tool definitions in tool-definitions-ai-bot-{stage} with
execution_type='mcp' expose their server's tools to the agent via Strands'
native MCP client (strands.tools.mcp.mcp_client).

Tool definition shape (from DDB):
  {
    "tool_id": "mcp-tld",
    "name": "mcp-tld",
    "execution_type": "mcp",
    "url": "https://api.findadomain.dev/mcp",     # MCP server endpoint
    "auth": {                                     # optional; when present, OAuth2
      "token_url": "https://.../oauth2/token",
      "client_id": "...",
      "client_secret": "..."
    },
    "description": "Tools for internet domain information"
  }

Loader must:
  - Dispatch on execution_type: 'lambda' (existing) | 'mcp' (new) | 'inline' (pending)
  - For 'mcp': obtain OAuth2 bearer token if auth present; connect MCP client; list
    available tools; return them as Strands tools that the agent can invoke.
  - Surface MCP tool errors as ToolResult with status='error' (never raise out).
"""
import pytest
from unittest.mock import MagicMock, patch


MCP_TOOL_DEF = {
    'tool_id': 'mcp-tld',
    'name': 'mcp-tld',
    'execution_type': 'mcp',
    'url': 'https://api.findadomain.dev/mcp',
    'auth': {
        'token_url': 'https://oauth.example.com/token',
        'client_id': 'cid',
        'client_secret': 'csecret',
    },
    'description': 'Tools for internet domain information',
}


MCP_TOOL_DEF_NO_AUTH = {
    'tool_id': 'mcp-public',
    'name': 'mcp-public',
    'execution_type': 'mcp',
    'url': 'https://public-mcp.example.com/mcp',
    'description': 'Public MCP server',
}


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

class TestExecutionTypeDispatch:

    def test_build_strands_tools_dispatches_mcp_type(self):
        """agent_loader.build_strands_tools() must route execution_type='mcp' to MCP loader."""
        from agent_loader import build_strands_tools  # noqa: PLC0415

        with patch('agent_loader._build_mcp_tools') as mock_mcp, \
             patch('agent_loader._build_lambda_tool') as mock_lam:
            mock_mcp.return_value = []
            mock_lam.return_value = MagicMock()

            build_strands_tools(
                tool_defs=[MCP_TOOL_DEF, {'tool_id': 'x', 'execution_type': 'lambda',
                                          'lambda_arn': 'arn:...'}],
                session_attributes={},
            )
            assert mock_mcp.called, 'MCP dispatch must call MCP loader'

    def test_unknown_execution_type_is_skipped_not_raised(self):
        """Unknown execution_type must be skipped with a warning, not blow up the loader."""
        from agent_loader import build_strands_tools  # noqa: PLC0415

        tools = build_strands_tools(
            tool_defs=[{'tool_id': 'wat', 'execution_type': 'something_new'}],
            session_attributes={},
        )
        assert tools == [] or tools is None


# ---------------------------------------------------------------------------
# OAuth2 token fetch
# ---------------------------------------------------------------------------

class TestMcpOAuth:

    def test_fetches_bearer_token_when_auth_present(self):
        """When auth block present, post client_credentials to token_url and cache the token."""
        from mcp_tools import fetch_oauth_token  # noqa: PLC0415

        with patch('mcp_tools.requests.post') as mock_post:
            mock_post.return_value.status_code = 200
            mock_post.return_value.json.return_value = {
                'access_token': 'tok-123', 'expires_in': 3600,
            }
            token = fetch_oauth_token(MCP_TOOL_DEF['auth'])
            assert token == 'tok-123'
            args, kwargs = mock_post.call_args
            assert args[0] == 'https://oauth.example.com/token'
            body = kwargs.get('data') or kwargs.get('json') or {}
            assert body.get('grant_type') == 'client_credentials'
            assert body.get('client_id') == 'cid'

    def test_no_auth_block_returns_none_token(self):
        from mcp_tools import fetch_oauth_token  # noqa: PLC0415
        assert fetch_oauth_token(None) is None


# ---------------------------------------------------------------------------
# Tool surfacing
# ---------------------------------------------------------------------------

class TestMcpToolSurfacing:

    def test_mcp_tools_are_agent_consumable(self):
        """Tools returned by MCP loader must be usable by strands.Agent — same protocol
        as PythonAgentTool/@tool decorator outputs."""
        from mcp_tools import build_mcp_tools  # noqa: PLC0415

        with patch('mcp_tools.MCPClient') as MockClient:
            fake_client = MagicMock()
            fake_client.list_tools.return_value = [
                {'name': 'find_domain', 'description': 'look up a domain',
                 'inputSchema': {'type': 'object', 'properties': {'name': {'type': 'string'}}}}
            ]
            MockClient.return_value.__enter__.return_value = fake_client

            tools = build_mcp_tools(MCP_TOOL_DEF)
            assert len(tools) >= 1
            # Each surfaced tool must have a name the agent can invoke
            assert any(getattr(t, 'tool_name', None) == 'find_domain' or
                       getattr(t, 'name', None) == 'find_domain' for t in tools)

    def test_mcp_connection_failure_does_not_crash_agent(self):
        """If the MCP server is unreachable, loader must return [] and log, not raise."""
        from mcp_tools import build_mcp_tools  # noqa: PLC0415

        with patch('mcp_tools.MCPClient') as MockClient:
            MockClient.return_value.__enter__.side_effect = ConnectionError('unreachable')
            tools = build_mcp_tools(MCP_TOOL_DEF)
            assert tools == []
