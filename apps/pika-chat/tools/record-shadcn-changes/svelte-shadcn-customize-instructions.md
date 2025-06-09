# Instructions for Documenting Svelte Shad CN Component Customizations

This document provides instructions for documenting customizations made to Svelte Shad CN components in our project.

## File Organization

Expect that the engineer will have first made a copy of the unmodified component and stored it in `original-unmodified-shadcn-components`, a directory that is a sibling of this markdown file.

Expect that the modified component referenced will exist in `kikia-app/src/lib/components/ui`.

## Instructions for Documenting Customizations

When making customizations to a Svelte Shad CN component, follow these steps:

1. **Ask the Developer for The Files**

    - Ask the developer for the original and modified files if you can't already just find them

2. **Update Documentation**

    - Generate the following content for the change by comparing the two files
    - Search for an existing section for the component under "Customizations" in `svelte-shadcn-changes.md` a sibling of this markdown file
    - If found, append the documented changes to the section while preserving existing documentation
    - If not found, create a new section with the component name as a level 3 header and append the documented changes
    - Include the full file path of the modified component and original component
    - Infer the reason for the change in easy to understand language
    - Provide clear, step-by-step instructions for reapplying the changes such that we could re-create the change if needed

3. **Format Requirements**
    - Use level 3 headers (###) for component names
    - Include file paths in code blocks
    - Provide code snippets when relevant
    - Explain changes in enough detail to allow future reapplication
