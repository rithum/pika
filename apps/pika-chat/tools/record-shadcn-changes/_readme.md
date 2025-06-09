# Svelte ShadCN Component Customization Guide

This guide explains how to properly customize Svelte ShadCN components while maintaining documentation of changes so we can continue
to upgrade components in the future if we want to.

## Before Making Changes

1. **Check for Existing Customizations**

    - Look in `tools/record-shadcn-changes/original-unmodified-shadcn-components` for the component you want to modify
    - If the component exists there, someone has already customized it
    - If not, you'll need to preserve the original version

2. **Preserve Original Component**
    - Copy the component from `src/lib/components/ui` to `tools/record-shadcn-changes/original-unmodified-shadcn-components`
    - Maintain the same folder structure (e.g., `sheet/sheet-content.svelte` → `original-unmodified-shadcn-components/sheet/sheet-content.svelte`)

## Making and Documenting Changes

1. **Make Your Changes**

    - Modify the component in `src/lib/components/ui`
    - Use your preferred code editor/IDE

2. **Document the Changes**

    - Use the code assistant (e.g., Cursor) with this file as reference
    - Provide paths to both modified and original components if needed
    - The assistant will:
        - Compare the files
        - Update `svelte-shadcn-changes.md`
        - Document the changes with clear instructions

3. **Review Documentation**
    - Check `svelte-shadcn-changes.md` to ensure:
        - Your changes are accurately documented
        - Previous customizations are preserved
        - No unintended modifications were made
