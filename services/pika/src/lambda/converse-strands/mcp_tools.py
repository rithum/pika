"""MCP (Model Context Protocol) tool loading for Strands.

Contract: tests/test_contract_mcp_tools.py

Surfaces tools from a remote MCP server as Strands AgentTools via the SDK's
native client (strands.tools.mcp.mcp_client.MCPClient). When the tool
definition carries an `auth` block, we exchange client credentials for a
bearer token and attach it as an Authorization header on the transport.

Errors never escape: OAuth failures and MCP connection failures are logged
and return [] / None so the agent degrades gracefully.
"""
import logging
from typing import Any, Dict, List, Optional

import requests
from strands.tools.mcp.mcp_client import MCPClient

logger = logging.getLogger(__name__)

_OAUTH_TIMEOUT_SEC = 10

# MCPClient is a context-managed, long-running session (background thread +
# initialized channel). It MUST stay open while the agent is invoking tools,
# otherwise call_tool_async raises MCPClientInitializationError.
# build_mcp_tools enters the client; the handler calls close_mcp_clients()
# once the agent has finished so every session is properly stopped.
_active_mcp_clients: List[Any] = []


def close_mcp_clients() -> None:
    """Exit every MCPClient context registered by build_mcp_tools(). Idempotent."""
    while _active_mcp_clients:
        ctx = _active_mcp_clients.pop()
        try:
            ctx.__exit__(None, None, None)
        except Exception as e:
            logger.warning(f"MCP client close failed: {e}")


def fetch_oauth_token(auth: Optional[Dict[str, Any]]) -> Optional[str]:
    """Exchange client_credentials for a bearer token. Returns None on any failure."""
    if not auth:
        return None
    token_url = auth.get('token_url')
    client_id = auth.get('client_id')
    client_secret = auth.get('client_secret')
    if not (token_url and client_id and client_secret):
        return None
    try:
        resp = requests.post(
            token_url,
            data={
                'grant_type': 'client_credentials',
                'client_id': client_id,
                'client_secret': client_secret,
            },
            timeout=_OAUTH_TIMEOUT_SEC,
        )
        if getattr(resp, 'status_code', 200) >= 400:
            logger.warning(f"OAuth token fetch returned {resp.status_code}")
            return None
        body = resp.json()
        return body.get('access_token') if isinstance(body, dict) else None
    except Exception as e:
        logger.warning(f"OAuth token fetch failed: {e}")
        return None


class _DictMCPTool:
    """Lightweight wrapper around an MCP tool spec dict.

    Used only when the MCP client returns raw dicts (older clients or unit
    mocks). Real MCPClient.list_tools_sync() already yields MCPAgentTool
    instances that satisfy Strands' AgentTool protocol.
    """

    def __init__(self, raw: Dict[str, Any]):
        self._raw = raw
        self.name = raw.get('name')
        self.tool_name = self.name
        self.description = raw.get('description', '')
        self.input_schema = raw.get('inputSchema') or raw.get('input_schema') or {}


def _list_mcp_tools(client: Any) -> List[Any]:
    """Prefer list_tools() for contract parity; fall back to Strands' list_tools_sync().

    Real MCPClient exposes list_tools_sync(); older/stub clients (and the
    contract's MagicMock) expose list_tools(). We try the contract path first
    and recover from AttributeError on real clients.
    """
    try:
        result = client.list_tools()
    except AttributeError:
        result = client.list_tools_sync()
    if result is None:
        return []
    try:
        return list(result)
    except TypeError:
        return [result]


def build_mcp_tools(tool_def: Dict[str, Any]) -> List[Any]:
    """Connect to an MCP server and return its tools as agent-consumable objects.

    Returns [] on any connection or discovery failure — the agent must never
    fail to start because one MCP server is unreachable.
    """
    url = tool_def.get('url')
    if not url:
        logger.warning(f"MCP tool {tool_def.get('tool_id')} missing 'url'; skipping")
        return []

    token = fetch_oauth_token(tool_def.get('auth'))
    headers = {'Authorization': f'Bearer {token}'} if token else {}

    def _transport():
        # Imported lazily so test patches on MCPClient don't require the mcp
        # package's transport internals to resolve.
        from mcp.client.streamable_http import streamablehttp_client  # noqa: PLC0415
        return streamablehttp_client(url, headers=headers)

    ctx = MCPClient(_transport)
    try:
        client = ctx.__enter__()
    except Exception as e:
        logger.warning(f"MCP connection to {url} failed: {e}")
        return []

    try:
        raw_tools = _list_mcp_tools(client)
    except Exception as e:
        logger.warning(f"MCP list_tools from {url} failed: {e}")
        try:
            ctx.__exit__(type(e), e, e.__traceback__)
        except Exception:
            pass
        return []

    _active_mcp_clients.append(ctx)

    wrapped: List[Any] = []
    for t in raw_tools:
        if isinstance(t, dict):
            wrapped.append(_DictMCPTool(t))
        else:
            wrapped.append(t)
    return wrapped
