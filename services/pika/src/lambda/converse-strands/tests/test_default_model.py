import re
from pathlib import Path

from pricing import MODEL_PRICING

HANDLER_SOURCE = (Path(__file__).resolve().parent.parent / 'handler.py').read_text()


def test_sonnet_4_6_has_pricing_row():
    assert 'us.anthropic.claude-sonnet-4-6' in MODEL_PRICING


def test_handler_default_model_is_sonnet_5_5():
    assert re.search(r"DEFAULT_MODEL_ID\s*=\s*os\.environ\.get\('MODEL_ID',\s*SONNET_5_5_MODEL_ID\)", HANDLER_SOURCE)
    match = re.search(r"SONNET_5_5_MODEL_ID\s*=\s*'([^']+)'", HANDLER_SOURCE)
    assert match is not None
    assert match.group(1) == 'us.anthropic.claude-sonnet-5-5'
