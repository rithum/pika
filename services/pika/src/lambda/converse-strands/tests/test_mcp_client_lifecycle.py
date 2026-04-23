"""Regression tests for MCPClient session lifecycle.

These guard against the bug fixed in 62a96d9 — build_mcp_tools originally
used ``with MCPClient(...) as client:`` and returned after the block exited,
which closed the background thread and session before the agent could ever
invoke a tool. The agent then raised MCPClientInitializationError ("the
client session is not running").

The contract tests only assert the shape of the returned tools, not when the
session is closed. These tests pin down the lifecycle:

  1. build_mcp_tools MUST NOT call __exit__ before returning.
  2. close_mcp_clients() closes every registered context exactly once.
  3. A failure during list_tools still releases the context (no leak).
"""
from unittest.mock import MagicMock, patch

import mcp_tools


TOOL_DEF = {
    'tool_id': 'mcp-x',
    'name': 'mcp-x',
    'execution_type': 'mcp',
    'url': 'https://mcp.example.com/mcp',
}


def _reset_registry():
    mcp_tools._active_mcp_clients.clear()


def test_build_mcp_tools_does_not_exit_context():
    """The MCPClient context must remain open so the agent can invoke tools."""
    _reset_registry()
    fake_client = MagicMock()
    fake_client.list_tools.return_value = [
        {'name': 'do_thing', 'description': 'does it', 'inputSchema': {}}
    ]

    with patch('mcp_tools.MCPClient') as MockClient:
        MockClient.return_value.__enter__.return_value = fake_client

        tools = mcp_tools.build_mcp_tools(TOOL_DEF)

        assert len(tools) == 1
        assert MockClient.return_value.__enter__.called, (
            'build_mcp_tools must enter the MCPClient context'
        )
        assert not MockClient.return_value.__exit__.called, (
            'build_mcp_tools must NOT exit the context — the agent needs the '
            'session alive for call_tool_async'
        )
        assert MockClient.return_value in mcp_tools._active_mcp_clients, (
            'open contexts must be registered for later cleanup'
        )

    _reset_registry()


def test_close_mcp_clients_exits_every_registered_context():
    """close_mcp_clients() must __exit__ each registered context exactly once."""
    _reset_registry()
    fake_client_a = MagicMock()
    fake_client_a.list_tools.return_value = []
    fake_client_b = MagicMock()
    fake_client_b.list_tools.return_value = []

    with patch('mcp_tools.MCPClient') as MockClient:
        # Two separate MCPClient() instances — side_effect returns each in turn.
        ctx_a = MagicMock()
        ctx_a.__enter__.return_value = fake_client_a
        ctx_b = MagicMock()
        ctx_b.__enter__.return_value = fake_client_b
        MockClient.side_effect = [ctx_a, ctx_b]

        mcp_tools.build_mcp_tools(TOOL_DEF)
        mcp_tools.build_mcp_tools({**TOOL_DEF, 'tool_id': 'mcp-y',
                                   'url': 'https://mcp-y.example.com/mcp'})

        assert len(mcp_tools._active_mcp_clients) == 2
        assert not ctx_a.__exit__.called
        assert not ctx_b.__exit__.called

        mcp_tools.close_mcp_clients()

        assert ctx_a.__exit__.call_count == 1
        assert ctx_b.__exit__.call_count == 1
        assert mcp_tools._active_mcp_clients == [], (
            'close_mcp_clients must drain the registry so idempotent re-runs '
            'do not double-close sessions'
        )

        # Second call is a no-op (nothing to close).
        mcp_tools.close_mcp_clients()
        assert ctx_a.__exit__.call_count == 1


def test_list_tools_failure_releases_context_and_does_not_register():
    """If list_tools raises, the context must be exited immediately and NOT
    left in the registry — otherwise close_mcp_clients would try to exit an
    already-released session later."""
    _reset_registry()
    fake_client = MagicMock()
    fake_client.list_tools.side_effect = RuntimeError('boom')
    # list_tools_sync is the fallback path; make it blow up too so the outer
    # except-clause fires.
    fake_client.list_tools_sync.side_effect = RuntimeError('boom sync')

    with patch('mcp_tools.MCPClient') as MockClient:
        MockClient.return_value.__enter__.return_value = fake_client

        tools = mcp_tools.build_mcp_tools(TOOL_DEF)

        assert tools == []
        assert MockClient.return_value.__exit__.called, (
            'a failure during list_tools must release the MCPClient context '
            'immediately, not leak it into the registry'
        )
        assert MockClient.return_value not in mcp_tools._active_mcp_clients

    _reset_registry()
