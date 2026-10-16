"""Fixture that runs a test against the default hooks, whatever `custom_hooks.py` overrides.

Import it explicitly (`from tests.hook_defaults import base_hooks  # noqa: F401`). It is
not in conftest.py because consumers patch conftest.py.
"""
import sys
import types

import pytest


@pytest.fixture
def base_hooks():
    original = sys.modules.get('custom_hooks')
    sys.modules['custom_hooks'] = types.ModuleType('custom_hooks')
    try:
        yield
    finally:
        if original is None:
            sys.modules.pop('custom_hooks', None)
        else:
            sys.modules['custom_hooks'] = original


@pytest.fixture
def override_hooks():
    """Install a throwaway `custom_hooks` module; the test sets attributes on what it yields."""
    original = sys.modules.get('custom_hooks')
    module = types.ModuleType('custom_hooks')
    sys.modules['custom_hooks'] = module
    try:
        yield module
    finally:
        if original is None:
            sys.modules.pop('custom_hooks', None)
        else:
            sys.modules['custom_hooks'] = original
