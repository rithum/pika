# Release Notes Prompt Templates

This file contains the prompt templates used by the \`pnpm release notes\` command.
Variables are marked with \`{{variableName}}\` and will be replaced at runtime.

---

## PROMPT_EXISTING_VERSION

Use this when a version is already published and we need to create/add to the next version.

```
**TASK: Add changes to the next version section**

⚠️ Version {{existingVersion}} is already PUBLISHED - do NOT modify it.

**Step 1: Run these git commands to see my changes:**

\`\`\`bash

# See commits on current branch vs {{baseBranch}}

git log {{baseBranch}}..HEAD --oneline

# See uncommitted changes

git status --short

# See modified files

git diff {{baseBranch}}...HEAD --name-only

# IMPORTANT: Check feature documentation changes

git diff {{baseBranch}}...HEAD --name-only -- apps/pika-docs/src/routes/docs/features/
\`\`\`

**Step 1b: Review feature documentation changes:**

If feature docs changed:

\`\`\`bash

# See actual content changes in feature docs

git diff {{baseBranch}}...HEAD -- apps/pika-docs/src/routes/docs/features/
\`\`\`

These will be included in the next release after {{existingVersion}}.

**Step 2: Determine the next version and add entries:**

1. **Check releases.json** - Look for an unreleased version entry in the releases array
2. **If unreleased version exists** - Add to that version (e.g., [0.6.0])
3. **If no unreleased version** - Create one based on change type:
   - Breaking changes → next minor (0.5.0 → 0.6.0)
   - New features → next minor (0.5.0 → 0.6.0)
   - Bug fixes → next patch (0.5.0 → 0.5.1)

4. **CHANGELOG.md** - Add to the next version section (e.g., [0.5.1] or [0.6.0]):

    - Add entries to appropriate categories (Breaking Changes, Added, Changed, Fixed, Deprecated)
    - Format: \`- Description [#PR] (@username)\`
    - User-focused descriptions
    - Section header should have date as "TBD" (e.g., \`## [0.5.1] - TBD\`)

5. **apps/pika-docs/src/routes/docs/releases/changelog/+page.md** - Keep in sync

6. **releases.json** - If you created a new unreleased version:
    - Add entry to releases array with \`status: "unreleased"\` and \`date: "TBD"\`
    - Include version, breaking flag, summary, highlights
    - \`status\` will be changed to "released" when finalizing

**CRITICAL Documentation Rules:**

- TypeScript: MUST use \`\`\`js (never \`\`\`typescript)
- Tabs: Line breaks after \`<TabPanel>\`, before \`</TabPanel>\`, no indentation
- Section links: Spaces become dashes, case is preserved (e.g., "## Accessing S3 Files" → \`#Accessing-S3-Files\`)

**Release Documentation Note:**
If adding breaking changes, also update:

- \`releases.json\` - Ensure version entry has \`breaking: true\`, migration guide URL, and affected components
- \`apps/pika-docs/src/routes/docs/releases/overview/+page.md\` - Update unreleased section
- \`apps/pika-docs/src/routes/docs/releases/migration-guides/+page.md\` - Add migration guide link

**Action Required:** Add new entries to the next version section (NOT [{{existingVersion}}]). [{{existingVersion}}] is locked and published.
```

---

## PROMPT_UNPUBLISHED_VERSION

Use this when a version is finalized but not yet published.

```
**TASK: Add more changes to [{{finalizeVersion}}] before publishing**

✅ Version {{finalizeVersion}} is finalized but NOT published yet - you can add to it!

**Step 1: Run these git commands to see my changes:**

\`\`\`bash

# See commits on current branch vs {{baseBranch}}

git log {{baseBranch}}..HEAD --oneline

# See uncommitted changes

git status --short

# See modified files

git diff {{baseBranch}}...HEAD --name-only

# IMPORTANT: Check feature documentation changes

git diff {{baseBranch}}...HEAD --name-only -- apps/pika-docs/src/routes/docs/features/
\`\`\`

**Step 1b: Review feature documentation changes:**

If feature docs changed:

\`\`\`bash

# See actual content changes in feature docs

git diff {{baseBranch}}...HEAD -- apps/pika-docs/src/routes/docs/features/
\`\`\`

These feature updates should be included in [{{finalizeVersion}}].

**Step 2: Add entries to [{{finalizeVersion}}] section:**

1. **CHANGELOG.md** - Add to [{{finalizeVersion}}]:

    - Add entries to appropriate categories (Breaking Changes, Added, Changed, Fixed, Deprecated)
    - Format: \`- Description [#PR] (@username)\`
    - User-focused descriptions
    - These will be included when {{finalizeVersion}} is published

2. **apps/pika-docs/src/routes/docs/releases/changelog/+page.md** - Keep in sync

3. **apps/pika-docs/src/routes/docs/releases/overview/+page.md** - Update if needed:
    - Check if "Upcoming Release" section mentions {{finalizeVersion}}
    - If yes, update it with the new changes/summary
    - If no, the overview is fine as-is

**CRITICAL Documentation Rules:**

- TypeScript: MUST use \`\`\`js (never \`\`\`typescript)
- Tabs: Line breaks after \`<TabPanel>\`, before \`</TabPanel>\`, no indentation
- Section links: Spaces become dashes, case is preserved (e.g., "## Accessing S3 Files" → \`#Accessing-S3-Files\`)

**Release Documentation Note:**
If adding breaking changes to [{{finalizeVersion}}], ensure:

- \`releases.json\` - Ensure {{finalizeVersion}} entry has \`breaking: true\` if adding breaking changes
- \`apps/pika-docs/src/routes/docs/releases/overview/+page.md\` - Update "Upcoming Release" section to reflect breaking changes

**Action Required:** Add to [{{finalizeVersion}}] - perfect for last-minute fixes!
```

---

## PROMPT_FINALIZE

Use this when finalizing a release (updating date from TBD to actual date and marking as released).

```
**TASK: Finalize release {{finalizeVersion}} - Update date and mark as released**

**Step 1: Run these git commands to review all changes:**

\`\`\`bash

# See all commits on current branch vs {{baseBranch}}

git log {{baseBranch}}..HEAD --oneline

# See uncommitted changes

git status --short

# See all modified files

git diff {{baseBranch}}...HEAD --name-only

# IMPORTANT: Check feature documentation changes

git diff {{baseBranch}}...HEAD --name-only -- apps/pika-docs/src/routes/docs/features/
\`\`\`

**Step 1b: Review feature documentation changes:**

If feature docs changed, check what was updated:

\`\`\`bash

# See actual content changes in feature docs

git diff {{baseBranch}}...HEAD -- apps/pika-docs/src/routes/docs/features/
\`\`\`

Ensure these feature updates are documented in the release notes.

**Step 2: Finalize the release in all files:**

1. **CHANGELOG.md** - Update [{{finalizeVersion}}] header:

    - Change: \`## [{{finalizeVersion}}] - TBD\` → \`## [{{finalizeVersion}}] - {{currentDate}}\`
    - Ensure all entries are complete and properly categorized
    - Verify no placeholder text remains

2. **apps/pika-docs/src/routes/docs/releases/changelog/+page.md** - Same changes

3. **apps/pika-docs/src/routes/docs/releases/overview/+page.md** - Update version sections:
    - Move {{finalizeVersion}} from "Upcoming Release" to "Current Version"
    - Update "Latest Stable" to show {{finalizeVersion}} with date
    - Update version history table with actual date
    - Remove or update "Upcoming Release" section (if no new unreleased versions exist)

4. **releases.json** - Update the {{finalizeVersion}} entry:
    - Update \`date: "TBD"\` → \`date: "{{currentDate}}"\`
    - **Keep** \`status: "unreleased"\` (the publish command will change it to "released")
    - Verify \`breaking\` flag, \`summary\`, \`highlights\`, and \`migrationGuideUrl\` are accurate

**CRITICAL Documentation Rules:**

- TypeScript: MUST use \`\`\`js (never \`\`\`typescript)
- Tabs: Line breaks after \`<TabPanel>\`, before \`</TabPanel>\`, no indentation
- Section links: Spaces become dashes, case is preserved (e.g., "## Accessing S3 Files" → \`#Accessing-S3-Files\`)

**Breaking Changes Check:**
If [{{finalizeVersion}}] has breaking changes:

- Ensure migration guide exists at proper path
- Link from changelog entry
- Verify \`releases.json\` entry has \`breaking: true\` and migration guide URL
- Update \`apps/pika-docs/src/routes/docs/releases/overview/+page.md\` to move from unreleased to current

**Action Required:** Update [{{finalizeVersion}}] date to today but keep status as "unreleased". Run "pnpm release publish" next to mark as released and create git tag.
```

---

## PROMPT_INCREMENTAL

Use this for incremental updates (default behavior).

```
**TASK: Update release notes for version {{workingVersion}}**

**Step 1: Run these git commands to see my changes:**

\`\`\`bash

# See commits on current branch vs {{baseBranch}}

git log {{baseBranch}}..HEAD --oneline

# See uncommitted changes

git status --short

# See modified files

git diff {{baseBranch}}...HEAD --name-only

# IMPORTANT: Check feature documentation changes

git diff {{baseBranch}}...HEAD --name-only -- apps/pika-docs/src/routes/docs/features/
\`\`\`

**Step 1b: Review feature documentation changes:**

If the git diff shows changes in \`apps/pika-docs/src/routes/docs/features/\`, these indicate new features or feature enhancements. Use git diff to see what changed:

\`\`\`bash

# See actual content changes in feature docs

git diff {{baseBranch}}...HEAD -- apps/pika-docs/src/routes/docs/features/
\`\`\`

Feature doc updates should be reflected in the release notes under **Added** or **Changed** categories.

**Step 2: Update both files with new release notes:**

1. **CHANGELOG.md** - Add entries to [{{workingVersion}}] section:

    - **Breaking Changes** - API changes, removed features, requires manual migration
    - **Added** - New features/capabilities
    - **Changed** - Modifications to existing features (backward compatible)
    - **Fixed** - Bug fixes
    - **Deprecated** - Features marked for removal

    Format: \`- Description [#PR] (@username)\`
    Focus: USER impact (why it matters), not technical details

2. **apps/pika-docs/src/routes/docs/releases/changelog/+page.md** - Keep in sync with CHANGELOG.md

**CRITICAL Documentation Rules:**

- TypeScript code: MUST use \`\`\`js syntax (framework bug, never \`\`\`typescript)
- Tabs component: Line breaks after \`<TabPanel>\`, before \`</TabPanel>\`, NO indentation inside
- Section links: Spaces become dashes, case is preserved (e.g., "## Accessing S3 Files" → \`#Accessing-S3-Files\`)

**Breaking Changes Protocol:**

If you detect breaking changes:

1. Flag clearly: "⚠️ BREAKING:"
2. Create migration guide at: \`apps/pika-docs/src/routes/docs/releases/migration-guides/[feature-name]/+page.md\`
3. Include: What changed, Why, Who's affected, Step-by-step migration, Before/After examples
4. Link from changelog: \`See: [Migration Guide](/docs/releases/migration-guides/[name])\`
5. Update \`apps/pika-docs/vite.config.ts\` if adding new top-level migration guide pages to the Releases sidebar navigation
6. Update \`releases.json\` - Ensure the version {{workingVersion}} entry has \`breaking: true\` and proper migration guide URL

**Writing Standards:**

- User-focused: Explain impact, not implementation
- Clear & concise: One line per change
- Action-oriented: "Added X to enable Y" not "X was added"
- Group related changes
- Skip internal refactors unless user-visible

**Release Documentation Note:**
If adding breaking changes, also update:

- \`releases.json\` - Ensure version {{workingVersion}} has \`breaking: true\`, migration guide URL, and affected components listed
- \`apps/pika-docs/src/routes/docs/releases/overview/+page.md\` - Update the unreleased version section if needed
- \`apps/pika-docs/src/routes/docs/releases/migration-guides/+page.md\` - Add migration guide link to the index

**Action Required:** Add new entries to [{{workingVersion}}]. If I've run this before, append to existing entries.
```

---

## PROMPT_PLAN_BREAKING

Use this when planning a breaking change BEFORE implementation.

```
**TASK: Document planned breaking change and create migration guide**

I'm planning a breaking change that needs to be documented BEFORE implementation.

**Step 1: Gather information about the breaking change**

Ask me these questions to understand the change:

1. **What is changing (summary)?** (Brief technical description)
2. **Why is this change necessary?** (The problem it solves)
3. **Who will be affected?** (All users? Specific features? Advanced users only?)
4. **What manual steps will users need to take?** (Migrations, config changes, etc.)
5. **Can we provide automated migration?** (Scripts, CLI commands, etc.)
6. **Estimated breaking in which version?** (Next minor? Next major?)
7. **Do you want to continue and provide the complete description so I can implement the change also after documenting the change?**

**Step 2: Create migration guide**

Create a migration guide at: \`apps/pika-docs/src/routes/docs/releases/migration-guides/{{guideName}}/+page.md\`

Use \`apps/pika-docs/src/routes/docs/releases/migration-guides/upgrading-to-0-5-0/+page.md\` as a reference for structure and style.

The guide should include:

- **Title and metadata**: Version range, status (Upcoming/Current Breaking Change)
- **Overview**: What changed and why (old vs new system comparison)
- **Who Is Affected**: Checkboxes for different user types
- **What Changed**: Technical details of the change
- **Manual Upgrade Steps**: Detailed step-by-step instructions with code examples
- **Configuration Updates**: How to update app configs
- **Verification**: How to test the migration worked
- **Rollback**: How to revert if needed
- **Common Issues**: Troubleshooting section with problems/solutions
- **Support**: Links to additional resources

Use code blocks with \`\`\`js for JavaScript/TypeScript and \`\`\`bash for shell commands.

Include warnings/notes using: \`:::warning[Important]\` for critical steps.

**Note:** If creating a new top-level migration guide page (not a sub-section), you may need to add it to the Releases sidebar navigation in \`apps/pika-docs/vite.config.ts\`.

**Step 3: Add placeholder to changelog**

First, check \`releases.json\` for an unreleased version. If none exists, create one with \`status: "unreleased"\` and \`date: "TBD"\`.

Add to **CHANGELOG.md** and **apps/pika-docs/src/routes/docs/releases/changelog/+page.md** in the unreleased version's Breaking Changes section:

\`\`\`markdown
## [X.Y.Z] - TBD

### Breaking Changes

- **[PLANNED] {{Feature Name}}** - {{Brief description of the change}}
    - {{Why it's necessary}}
    - {{Who is affected}}
    - See [Migration Guide](/docs/releases/migration-guides/{{guide-name}})
    - **Status:** Planning phase - not yet implemented
\`\`\`

Also update:

- \`releases.json\` - Ensure the unreleased version entry has \`breaking: true\`, \`migrationGuideUrl\`, and \`affectedComponents\`
- \`apps/pika-docs/src/routes/docs/releases/overview/+page.md\` - Update upcoming release section
- \`apps/pika-docs/src/routes/docs/releases/migration-guides/+page.md\` - Add migration guide to the index

**Step 4: Create implementation checklist**

Add a comment or issue that includes:

\`\`\`markdown
### Breaking Change Implementation Checklist

- [ ] Migration guide created and reviewed
- [ ] Changelog entries added with [PLANNED] marker
- [ ] Breaking change announced to users (if applicable)
- [ ] Automated migration script created (if possible)
- [ ] Tests cover migration path
- [ ] Documentation updated
- [ ] Implementation complete
- [ ] Remove [PLANNED] marker from changelog
\`\`\`

**CRITICAL Documentation Rules:**

- TypeScript code: MUST use \`\`\`js syntax (framework bug, never \`\`\`typescript)
- Tabs component: Line breaks after \`<TabPanel>\`, before \`</TabPanel>\`, NO indentation inside
- Section links: Spaces become dashes, case is preserved (e.g., "## Accessing S3 Files" → \`#Accessing-S3-Files\`)
- Migration guides must be clear and actionable
- Include "before/after" code examples
- Test all commands and code snippets

**Action Required:**

1. Ask me the questions in Step 1
2. Create migration guide with template in Step 2
3. Add [PLANNED] entry to changelogs
4. Create implementation checklist
```
