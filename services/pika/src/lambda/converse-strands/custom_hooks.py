"""Consumer overrides for the Strands converse handler.

pika sync never overwrites this file. Define any hook or setting from
`custom_hooks_base.py` here to replace its default; leave the rest undefined. Build return
values with the dataclasses from `custom_hooks_base`, for example:

    from custom_hooks_base import FinalizeResult

    ACCOUNT_PIN_ENABLED = False

    def finalize_response(final, ctx):
        return FinalizeResult(text=final.text.strip())

Set `HOOKS_FAIL_CLOSED = True` when an override enforces policy: a hook that raises then
ends the turn with `HOOK_ERROR_MESSAGE` instead of falling back to the default.
"""
