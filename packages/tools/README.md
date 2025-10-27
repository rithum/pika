# Pika Framework Internal Tools

This package contains internal tooling for Pika Framework development and releases.

**This package is private and never published to npm.**

## Tools

### Release Manager (`src/release.ts`)

Professional CLI tool for managing releases with Cursor AI integration.

**Usage:**

```bash
cd packages/tools

# Publish a new release
pnpm release publish 0.5.0

# Or use shorthand (version number detected)
pnpm release 0.5.0

# Dry run (see what would happen)
pnpm release publish 0.5.0 --dry-run

# Update release notes as you work (includes uncommitted by default)
pnpm release notes

# Ignore uncommitted changes (only committed)
pnpm release notes --ignore-uncommitted

# Compare against a different branch
pnpm release notes --since develop

# Show the full prompt text (by default, only copies to clipboard)
pnpm release notes --show-prompt

# Finalize: Update date from TBD to today and mark as released (prompts for version)
pnpm release notes --finalize

# Or specify version directly
pnpm release notes --finalize 0.5.0

# Or use the convenient script
pnpm release:notes:finalize

# Smart behavior when you run finalize again:
# - Version finalized but NOT published yet? → Adds to that version (perfect!)
# - Version already published? → Creates/adds to next version
# - Tool auto-suggests next patch/minor/major based on current version

# Show current release information
pnpm release info

# Validate release configuration
pnpm release validate

# Plan a breaking change BEFORE implementing it
pnpm release plan-breaking

# Show the full prompt text (by default, only copies to clipboard)
pnpm release plan-breaking --show-prompt

# Or use tsx directly
tsx src/release.ts publish 0.5.0
tsx src/release.ts info
```

**Commands:**

- `publish <version>` - Publish a new release
    - `--dry-run` - Show what would be done without making changes
- `notes` - Generate Cursor AI prompt to update release notes incrementally
    - **Automatically copies prompt to clipboard** for easy pasting
    - Automatically checks documentation changes in `apps/pika-docs/src/content/docs/`
    - `--since <branch>` - Compare against specific branch (default: main)
    - `--ignore-uncommitted` - Ignore uncommitted changes (by default they ARE included)
    - `--finalize <version>` - Update version date from TBD to today and mark as released (handles already-finalized gracefully)
    - `--show-prompt` - Display the full prompt text (by default, only copies to clipboard)
- `plan-breaking` - Generate Cursor AI prompt to document a breaking change BEFORE implementation
    - **Automatically copies prompt to clipboard** for easy pasting
    - Helps you create migration guide and changelog entries
    - Interactive: AI asks you questions about the planned change
    - Creates migration guide template with all necessary sections
    - Adds [PLANNED] entry to changelog as a placeholder
    - Provides implementation checklist
    - `--show-prompt` - Display the full prompt text (by default, only copies to clipboard)
- `info` - Show current release information and recent releases
- `validate` - Validate release configuration and check for issues

**What the publish command does:**

1. ✓ Validates version format
2. ✓ Checks for uncommitted changes
3. ✓ Updates `releases.json` with the new version
4. ✓ Shows all git commits since last release
5. ✓ Generates a Cursor AI prompt for changelog generation
6. ✓ Creates git tag
7. ✓ Shows next steps checklist

**Cursor AI Integration:**

The tool generates a prompt that you copy into Cursor Composer (Cmd+Shift+I). The prompt instructs the AI to check your documentation changes (`apps/pika-docs/src/content/docs/`) to understand new features and enhancements. The AI will:

- Analyze your git commits
- Update `CHANGELOG.md`
- Update `apps/pika-docs/src/content/docs/platform/releases/changelog.mdoc`
- Write clear, user-focused release notes

This eliminates manual duplication between files!

**Progressive Release Notes Workflow:**

Instead of documenting everything at release time, update notes as you work:

```bash
# After making commits
cd packages/tools
pnpm release notes
# ✓ Prompt copied to clipboard!
# Paste into Cursor Composer → AI updates version section

# Continue working...
pnpm release notes
# Repeat as you work

# Ready to release? Finalize the changelog
pnpm release notes --finalize 0.5.0
# ✓ Prompt copied to clipboard!
# Paste into Cursor Composer → AI updates [0.5.0] date from TBD to today

# Commit and release
git add CHANGELOG.md apps/pika-docs/src/content/docs/platform/releases
git commit -m "docs: release v0.5.0"
git push
```

**Why this is better:**

- ✓ **Instant clipboard copy** - just paste into Cursor, no manual copying
- ✓ Document changes while they're fresh in your mind
- ✓ No scrambling to remember everything at release time
- ✓ Release notes stay up-to-date throughout development
- ✓ Cursor AI sees your actual commits and file changes for better context

**Planning Breaking Changes Workflow:**

When you need to make a breaking change (like a DynamoDB schema migration), document it FIRST:

```bash
# Step 1: Plan the breaking change (before implementation)
cd packages/tools
pnpm release plan-breaking
# ✓ Prompt copied to clipboard!
# Paste into Cursor Composer → AI asks questions, creates migration guide

# Step 2: Review the generated migration guide
# File created: apps/pika-docs/src/content/docs/platform/releases/migration-guides/[name].mdoc
# Changelog updated with [PLANNED] marker

# Step 3: Implement the breaking change
# ... your code changes ...

# Step 4: Document the implementation (after it's done)
pnpm release notes
# ✓ Prompt copied to clipboard!
# Paste into Cursor Composer → AI updates changelog, removes [PLANNED] marker
```

**What `plan-breaking` creates:**

- ✓ Complete migration guide with template sections (What Changed, Migration Steps, Troubleshooting, etc.)
- ✓ [PLANNED] entry in changelog as a placeholder
- ✓ Implementation checklist to track your progress
- ✓ Interactive Q&A to gather all necessary information

**Example use cases:**

- Database schema migrations (GSI changes, table restructuring)
- API breaking changes (renamed methods, removed parameters)
- Configuration format changes (new required fields, changed defaults)
- Behavioral changes that require user action

**What context Cursor AI receives:**

- ✅ Keep a Changelog format with proper categories (Breaking/Added/Changed/Fixed/Deprecated)
- ✅ Documentation formatting rules (TypeScript → ```js, Tabs component line breaks)
- ✅ Breaking changes protocol (flag with ⚠️, create migration guide, link from changelog)
- ✅ Writing standards (user-focused, clear, actionable, skip internal refactors)
- ✅ Your commit history and modified files categorized by type (packages/apps/services/docs)

See `PROMPT-CONTEXT.md` for complete details on what the AI knows.

## Protected from Sync

This entire package (`packages/tools/**`) is protected in `pika-cli`'s `protected-areas.json`.

When downstream users run `pika sync`, they won't receive this internal tooling directory.

## Prompt Design Philosophy

The prompts generated for Cursor AI are **action-oriented and directive**, not passive:

- ✅ Start with "**TASK:**" to signal this is an action request
- ✅ Use "**Step 1:**", "**Step 2:**" structure for clarity
- ✅ End with "**Action Required:**" for final clarity
- ✅ Use imperative language ("Update X", "Add Y") not passive voice

This ensures Cursor understands it should **take action immediately**, not just provide suggestions.

## Dependencies

- **chalk** - Terminal styling and colors
- **commander** - CLI framework for commands and options
- **ora** - Elegant terminal spinners
- **inquirer** - Interactive command-line prompts

## Development

This is a simple Node.js scripts package. No build step required - just run scripts with `tsx`.

To add new tools, create new files in `src/` and add commands to the CLI in `src/release.ts` (or create new entry points).

## Customizing Release Prompts

The Cursor AI prompts are stored in **`src/release-prompt.md`** as editable markdown templates. This makes it easy to:

- ✅ Update prompt wording without touching TypeScript code
- ✅ See the full prompt structure in readable markdown
- ✅ Version control your prompt changes
- ✅ Test prompt variations quickly

**How to edit:**

1. Open `src/release-prompt.md`
2. Find the prompt template you want to edit (PROMPT_INCREMENTAL, PROMPT_FINALIZE, etc.)
3. Edit the markdown within the triple backticks
4. Use `{{variableName}}` for dynamic values (baseBranch, finalizeVersion, etc.)
5. Save - changes take effect immediately

**Example:**

```markdown
## PROMPT_INCREMENTAL

\`\`\`
**TASK: Update release notes for {{baseBranch}}**

Check documentation:
\`\`\`bash
git diff {{baseBranch}}...HEAD -- apps/pika-docs/src/content/docs/
\`\`\`
\`\`\`
```

The `src/release.ts` script loads these templates and replaces the `{{variables}}` at runtime.
