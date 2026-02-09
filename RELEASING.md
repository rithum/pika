# Pika Framework Release Guide

Complete guide to releasing new versions of the Pika Framework.

## One-Time Git Setup (Highly Recommended)

Before you start releasing, configure git to automatically push tags:

```bash
git config --global push.followTags true
```

**Why?** Git doesn't push tags by default. This setting makes `git push` include annotated tags, so you don't have to push them separately.

**Without this:** You must manually run `git push origin v0.5.0` after every release.
**With this:** Just `git push` and you're done!

---

## Quick Start - What Are You Doing Today?

### 🐛 Making a Bug Fix

```bash
# 1. Create branch with fix/ prefix
git checkout -b fix/session-sorting-bug

# 2. Make your changes and commit
git commit -m "fix: correct session chronological sorting"

# 3. Update release notes (auto-detects patch bump: 0.5.0 → 0.5.1)
pnpm run release:notes
# → Creates/updates unreleased version
# → Copy prompt → Cursor Composer → Review & Accept

# 4. Commit documentation to your branch
git add releases.json CHANGELOG.md apps/pika-docs
git commit -m "docs: update release notes"

# 5. Push your branch
git push

# 6. Merge to main (via PR or direct)
git checkout main && git merge fix/session-sorting-bug && git push
```

### ✨ Adding a New Feature (Non-Breaking)

```bash
# 1. Create branch with feat/ prefix
git checkout -b feat/custom-title-actions

# 2. Make your changes and commit
git commit -m "feat: add custom title bar actions"

# 3. Update release notes (auto-detects minor bump: 0.5.0 → 0.6.0)
pnpm run release:notes
# → Creates/updates unreleased version
# → Copy prompt → Cursor Composer → Review & Accept

# 4. Commit documentation to your branch
git add releases.json CHANGELOG.md apps/pika-docs
git commit -m "docs: update release notes"

# 5. Push your branch
git push

# 6. Merge to main (via PR or direct)
git checkout main && git merge feat/custom-title-actions && git push
```

### 💥 Making a Breaking Change

**Important:** Breaking changes require migration guides BEFORE implementation.

```bash
# 1. Document the breaking change FIRST
pnpm release:plan-breaking
# → Copy prompt → Cursor Composer
# → AI will ask questions and create migration guide

# 2. Create branch with breaking/ prefix
git checkout -b breaking/tag-system-refactor

# 3. Make your changes and commit
git commit -m "breaking: refactor tag system to use usageMode"

# 4. Update release notes (auto-detects major bump: 0.5.0 → 0.6.0)
pnpm release:notes
# → Updates unreleased version
# → Ensures breaking: true and migration guide URL in releases.json
# → Copy prompt → Cursor Composer → Review & Accept

# 5. Commit documentation to your branch
git add releases.json CHANGELOG.md apps/pika-docs
git commit -m "docs: update release notes"

# 6. Push your branch
git push

# 7. Merge to main (via PR or direct)
git checkout main && git merge breaking/tag-system-refactor && git push
```

### 🚀 Finalizing & Publishing a Release

**One-Time Setup (Optional but Recommended):**

```bash
# Configure git to automatically push tags with commits
git config --global push.followTags true
# Now you can just do "git push" and tags will be included!
```

When you're ready to publish an unreleased version:

```bash
# 1. Check current status
pnpm release:info
# → Shows unreleased versions and deployment health

# 2. Finalize the release
pnpm release:notes:finalize
# → Prompts for version (shows unreleased versions)
# → Marks as "released" with today's date
# → Copy prompt → Cursor Composer → Review & Accept

# 3. Commit finalization to your branch
git add releases.json CHANGELOG.md apps/pika-docs
git commit -m "docs: finalize release v0.5.0"

# 4. (Optional) Validate everything before publishing
pnpm release:validate
# → Checks releases.json, CHANGELOG.md, git status

# 5. Publish (creates git tag)
pnpm release:publish
# → Auto-detects version if only one unreleased (or specify: pnpm release:publish 0.5.0)
# → Checks deployment state of main branch
# → Verifies version exists and is marked "released"
# → Creates git tag v0.5.0
# → Shows next steps

# 6. Push your branch with tag
git push              # Pushes commits (and tag if push.followTags configured)

# 7. Merge to main
git checkout main && git merge your-branch && git push

# 8. GitHub Actions automatically creates the release! 🎉
```

---

## Branch Naming Convention

**Critical:** Branch names drive automatic version detection.

| Branch Prefix             | Version Bump                 | Use For                  | Example                        |
| ------------------------- | ---------------------------- | ------------------------ | ------------------------------ |
| `breaking/*` or `major/*` | Major (0.x → 0.x+1)          | Breaking changes         | `breaking/tag-system-refactor` |
| `feat/*` or `feature/*`   | Minor (same as major in 0.x) | New features             | `feat/custom-title-actions`    |
| `fix/*`                   | Patch                        | Bug fixes                | `fix/session-sort-order`       |
| `chore/*`                 | Patch                        | Maintenance              | `chore/update-dependencies`    |
| `docs/*`                  | Patch                        | Documentation only       | `docs/release-guide`           |
| `refactor/*`              | Patch                        | Code refactoring         | `refactor/simplify-auth`       |
| `test/*`                  | Patch                        | Test additions/changes   | `test/add-integration-tests`   |
| `build/*`                 | Patch                        | Build system changes     | `build/update-tsconfig`        |
| `ci/*`                    | Patch                        | CI/CD changes            | `ci/add-release-workflow`      |
| `perf/*`                  | Patch                        | Performance improvements | `perf/optimize-queries`        |

**Versioning Rules:**

**Pre-1.0 (Current):**

- Breaking changes → bump minor (0.5.0 → 0.6.0)
- New features → bump minor (0.5.0 → 0.6.0)
- Bug fixes → bump patch (0.5.0 → 0.5.1)

**Post-1.0 (Future):**

- Breaking changes → bump major (1.0.0 → 2.0.0)
- New features → bump minor (1.0.0 → 1.1.0)
- Bug fixes → bump patch (1.0.0 → 1.0.1)

**Examples:**

```bash
# Breaking changes
git checkout -b breaking/chat-session-gsi-update
git checkout -b major/auth-overhaul

# New features
git checkout -b feat/static-widgets
git checkout -b feature/auto-height-components

# Bug fixes
git checkout -b fix/memory-leak-#123
git checkout -b fix/tag-filtering

# Maintenance & other patch changes
git checkout -b chore/deps-update
git checkout -b docs/improve-readme
git checkout -b refactor/simplify-auth
git checkout -b test/add-integration-tests
git checkout -b build/update-webpack
git checkout -b ci/improve-release-workflow
git checkout -b perf/optimize-db-queries
```

---

## The Complete Release Workflow

### Phase 1: Development & Documentation (In Feature Branch)

#### Step 1: Create Properly Named Branch

```bash
# Choose the right prefix based on your change type
git checkout -b feat/your-feature-name
```

#### Step 2: Write Good Commit Messages

```bash
git commit -m "feat: add version tracking to pika sync"
git commit -m "fix: resolve breaking change detection issue"
git commit -m "breaking: refactor tag system"
```

**Format:**

- `feat:` - New features
- `fix:` - Bug fixes
- `breaking:` - Breaking changes
- `docs:` - Documentation
- `chore:` - Maintenance

#### Step 3: Update Release Notes as You Go (Recommended)

After making meaningful commits:

```bash
pnpm release:notes
```

**What happens:**

1. Tool detects version bump from branch name
2. Creates/finds unreleased version in `releases.json`
3. Shows your commits and uncommitted changes
4. Generates Cursor AI prompt
5. AI updates both CHANGELOG.md and docs simultaneously

**Copy prompt → Cursor Composer → Review & Accept**

**Benefits:**

- Documents changes while they're fresh in your mind
- No big documentation session at the end
- Can run multiple times, AI appends to existing entries

#### Step 4: For Breaking Changes - Create Migration Guide

If your change is breaking:

```bash
pnpm release:plan-breaking
```

**Copy prompt → Cursor Composer**

AI will:

- Ask you questions about the breaking change
- Create migration guide at `apps/pika-docs/src/content/docs/platform/releases/migration-guides/`
- Update changelogs with links
- Update `releases.json` with migration guide URL

**Migration Guide Template:** Use `upgrading-to-0-5-0.mdoc` as reference.

#### Step 5: Commit Documentation to Your Branch

```bash
git add releases.json CHANGELOG.md apps/pika-docs
git commit -m "docs: release v0.5.0"
git push  # Push your feature branch
```

### Phase 2: Finalization (When Ready to Release)

#### Step 6: Finalize the Release

```bash
pnpm release:notes:finalize
```

**What happens:**

1. Shows unreleased versions
2. Prompts for version to finalize (or auto-detects if only one)
3. Marks version as "released" in `releases.json`
4. Updates date to today
5. Generates Cursor AI prompt for final updates

**Copy prompt → Cursor Composer → Review & Accept**

#### Step 7: Commit Finalization to Your Branch

```bash
git add releases.json CHANGELOG.md apps/pika-docs
git commit -m "docs: finalize release v0.5.0"
```

### Phase 3: Publishing (Tag & Merge)

#### Step 8: Publish (Creates Tag)

```bash
pnpm release:publish
# → Auto-detects version if only one unreleased
# → Or specify: pnpm release:publish 0.5.0
```

**What happens:**

1. Auto-detects version (if only one unreleased) or uses provided version
2. Validates version exists in `releases.json`
3. Verifies status is "released"
4. Creates git tag `v0.5.0`
5. Shows next steps

**Note:** Version is optional when only one unreleased version exists. Required when multiple.

#### Step 9: Push Your Branch (with Tag)

**If you configured `push.followTags` (recommended):**

```bash
git push  # Pushes commits AND tags
```

**If you didn't configure `push.followTags`:**

```bash
git push              # Pushes commits
git push origin v0.5.0  # Push tag separately
```

#### Step 10: Merge to Main

```bash
git checkout main
git merge your-feature-branch
git push
```

#### Step 11: GitHub Actions Automatically Creates Release

When `releases.json` is updated on main:

1. Detects version and status
2. Only creates release if status = "released"
3. Extracts release notes from CHANGELOG.md
4. Creates GitHub Release
5. Done! 🎉

---

## How the Release System Works

### Version Tracking

**releases.json** - Machine-readable release metadata

```json
{
    "latestVersion": "0.4.0",
    "currentDevelopment": "0.5.0",
    "releases": [
        {
            "version": "0.5.0",
            "date": "TBD",
            "status": "unreleased", // or "released"
            "breaking": true,
            "summary": "Tag system refactor + Chat session GSI update",
            "highlights": ["..."],
            "migrationGuideUrl": "https://...",
            "requiresManualSteps": true,
            "affectedComponents": ["..."]
        }
    ]
}
```

**Key Fields:**

- `status`: `"unreleased"` (in development) or `"released"` (published)
- `breaking`: Triggers warnings in `pika sync`
- `migrationGuideUrl`: Link to migration guide
- `affectedComponents`: What users need to check

### Automatic Version Detection

The `pnpm release notes` command:

1. Reads your current branch name
2. Auto-detects version bump type
3. Creates/finds unreleased version
4. Suggests version number

**No more manual version decisions!**

### Fallback to Baseline (0.4.0)

All tools gracefully handle missing `releases.json`:

- `pika create-app` → defaults to 0.4.0
- `pika sync` → creates baseline metadata
- `release.ts` → creates releases.json

**Backward compatible with pre-versioning projects.**

### User Experience (pika sync)

When users run `pika sync`:

```bash
$ pika sync

Current version: 0.4.0
Latest version: 0.5.0

⚠️  BREAKING CHANGES DETECTED!

[UNRELEASED] Version 0.5.0:
  Tag system refactor + Chat session GSI update

  Affected components:
    - Tag definitions DynamoDB table
    - Chat session DynamoDB table

  📖 Migration guide: https://pika.tools/.../upgrading-to-0-5-0

This update requires manual migration steps.

To proceed:
  pika sync --acknowledge-breaking-changes
```

**Features:**

- Shows version diff
- Warns about breaking changes (even unreleased ones)
- Links to migration guides
- Requires explicit acknowledgment

---

## Release Tools Reference

### pnpm release:notes

**Incremental updates** (default behavior):

```bash
pnpm release:notes
```

- Creates/updates unreleased version
- Auto-detects version from branch name
- Shows commits since main
- Generates Cursor AI prompt
- Can run multiple times (appends)

**Options:**

```bash
--since <branch>    # Compare against specific branch (default: main)
--show-prompt       # Display prompt in terminal
--finalize          # Mark version as released (see below)
```

### pnpm release:notes:finalize

**Finalize release**:

```bash
pnpm release:notes:finalize
# or
pnpm release:notes --finalize 0.5.0  # specify version
```

- Marks version as "released"
- Updates date to today
- Generates finalization prompt for Cursor AI

### pnpm release:publish [version]

**Publish release**:

```bash
pnpm release:publish        # Auto-detects if only one unreleased version
# or
pnpm release:publish 0.5.0  # Explicit version (required if multiple unreleased)
```

- Auto-detects version if only one unreleased (optional parameter)
- Checks deployment state of main branch
- Validates version exists and is "released"
- Creates git tag
- Shows next steps

**Options:**

```bash
--dry-run    # Show what would happen
```

**Behavior:**

- **No version + single unreleased**: Auto-detects and uses it
- **No version + multiple unreleased**: Shows list, asks you to specify
- **No version + no unreleased**: Error, run `pnpm release notes` first
- **With version**: Uses specified version (validates it exists)

### pnpm release:info

**Check release status and deployment health**:

```bash
pnpm release:info
```

Shows:

- Latest released version in main branch
- Unreleased versions in working copy
- Deployment state (tags, releases.json consistency)
- Recent releases
- Git status

### pnpm release:validate

**Validate configuration**:

```bash
pnpm release:validate
```

Checks:

- releases.json exists and is valid
- CHANGELOG.md exists
- Git repository status
- Version format

### pnpm release:plan-breaking

**Plan breaking change** (before implementation):

```bash
pnpm release:plan-breaking
```

- Interactive questionnaire
- Creates migration guide
- Updates changelogs
- Updates releases.json

---

## Files Updated During Releases

Every release touches these files:

1. **releases.json**
    - Add/update version entry
    - Set status: "unreleased" → "released"
    - Update latestVersion when publishing

2. **CHANGELOG.md**
    - Add entries to version section (e.g., `## [0.5.0]`)
    - NO MORE `[Unreleased]` section
    - Use actual version numbers immediately

3. **apps/pika-docs/src/content/docs/platform/releases/changelog.mdoc**
    - Keep in sync with CHANGELOG.md
    - Cursor AI updates both simultaneously

4. **Migration Guide** (if breaking)
    - Create at `apps/pika-docs/src/content/docs/platform/releases/migration-guides/<name>.mdoc`
    - Follow template structure
    - Include before/after examples

5. **apps/pika-docs/sidebar-config.ts** (if new migration guide)
    - Add to Platform Info → Releases → Migration Guides sidebar navigation in `sidebarTopics` array if needed

6. **apps/pika-docs/src/content/docs/platform/releases/migration-guides/index.mdoc**
    - Add link to new migration guide

---

## Cursor AI Integration

The release tool leverages Cursor's AI to automate documentation:

### How It Works

1. **Tool analyzes your changes**:
    - Git commits since last sync
    - Uncommitted changes (optional)
    - Feature doc updates

2. **Generates structured prompt**:
    - Includes all commit history
    - Specifies version number
    - Provides formatting rules
    - Lists files to update

3. **Cursor AI updates documentation**:
    - CHANGELOG.md
    - apps/pika-docs/src/content/docs/platform/releases/changelog.mdoc
    - Both updated in one operation

4. **You review and approve**:
    - Check entries make sense
    - Ensure user-focused descriptions
    - Verify formatting

### Documentation Rules (AI Follows These)

**TypeScript Code Blocks:**

```markdown
Use `js (not `typescript due to framework bug)
```

**Tabs Component:**

```markdown
Line breaks after <TabPanel>, before </TabPanel>
NO indentation inside
```

**Writing Standards:**

- **User-focused**: Explain impact, not implementation
- **Clear & concise**: One line per change
- **Action-oriented**: "Added X to enable Y" not "X was added"
- **Group related changes**
- **Skip internal refactors** unless user-visible

---

## Troubleshooting

### "Version not found in releases array"

When running `pnpm release:publish 0.5.0`:

**Problem:** Version doesn't exist in releases.json

**Solution:** Run `pnpm release:notes` first to create the version entry

### "Version already marked as released"

When running `pnpm release:notes:finalize`:

**Problem:** Version status is already "released"

**Solution:** This is usually fine, the tool will update anyway. If you meant to work on a new version, create a new branch with appropriate prefix.

### GitHub Actions doesn't create release

**Problem:** Pushed to main but no release created

**Check:**

1. Is `releases.json` updated in the main branch?
2. Is the version status = "released"?
3. Does the git tag already exist?
4. Check GitHub Actions logs

**Debug:**

```bash
# Check current status
cat releases.json | grep -A 10 '"version"'

# Check if tag exists
git tag -l | grep v0.5.0
```

### Cursor AI prompt not working

**Problem:** AI doesn't update files correctly

**Solutions:**

1. Ensure you're in Cursor Composer (Cmd+Shift+I)
2. Include full prompt (don't edit it)
3. Make sure mentioned files exist
4. Check file paths are relative to project root
5. Re-run the tool to regenerate prompt

### Can't finalize - uncommitted changes

**Problem:** Tool says you have uncommitted changes

**Solution:**

```bash
# Check status
git status

# Commit or stash changes
git add .
git commit -m "your message"
# or
git stash
```

### Wrong version bump detected

**Problem:** Tool detects patch when you wanted minor

**Solution:** Rename your branch with correct prefix:

```bash
git branch -m feat/your-feature-name
```

### Migration guide not linked

**Problem:** Breaking change but no migration guide in changelog

**Solution:**

1. Run `pnpm release:plan-breaking` if you haven't
2. Manually update changelogs to include migration guide link:

```markdown
See: [Migration Guide](/docs/releases/migration-guides/upgrading-to-0-5-0)
```

3. Update `releases.json` with `migrationGuideUrl` field

---

## Communication & Best Practices

### For Breaking Changes

**BEFORE Implementation:**

1. Document the breaking change
2. Create migration guide
3. Update changelogs with links
4. Consider email notification for users

**AFTER Implementation:**

1. Post in community channels
2. Update README if needed
3. Monitor for issues

### For Features

- Announce in changelog
- Update getting started guide if relevant
- Share on social media when significant
- Update feature documentation

### Commit Message Best Practices

Good commit messages help AI generate better release notes:

**Good:**

```bash
git commit -m "feat: add custom title bar actions for web components"
git commit -m "fix: resolve memory leak in session management (#123)"
git commit -m "breaking: refactor tag system from chatAppId to usageMode"
```

**Bad:**

```bash
git commit -m "updates"
git commit -m "wip"
git commit -m "fix stuff"
```

### When to Release

**Consider releasing when:**

- Complete a significant feature
- Fix critical bugs users need
- Make breaking changes (release promptly with clear guidance)
- Accumulate multiple improvements worth distributing

**Don't release for:**

- Every single commit
- Internal refactors (unless user-visible)
- Incomplete features
- Work in progress

**Frequency:**

- Breaking changes: Release promptly
- New features: Batch multiple in one release
- Bug fixes: Release soon (can batch minor fixes)
- Documentation: No release needed

---

## Protected Files

These files won't sync to downstream users (automatically protected):

- `RELEASING.md` (this file)
- `releases.json`
- `packages/tools/**` (entire release tooling)
- `.github/workflows/auto-release.yml`
- Various internal tooling

Users will receive:

- `CHANGELOG.md` (public version history)
- Migration guides
- Documentation updates

---

## Quick Reference Card

### I need to...

**Fix a bug:**

```bash
git checkout -b fix/bug-name
# make changes
pnpm release:notes
git push  # Push your branch
```

**Add a feature:**

```bash
git checkout -b feat/feature-name
# make changes
pnpm release:notes
git push  # Push your branch
```

**Make a breaking change:**

```bash
pnpm release:plan-breaking  # FIRST!
git checkout -b breaking/change-name
# make changes
pnpm release:notes
git push  # Push your branch
```

**Finalize a release:**

```bash
pnpm release:info                # Check status
pnpm release:notes:finalize      # Finalize version
pnpm release:validate            # (Optional) Validate
pnpm release:publish             # Create tag
git push                         # Push branch (includes tag if followTags configured)
git checkout main && git merge your-branch && git push
```

**Check status:**

```bash
pnpm release:info
```

### Key Commands

```bash
# Run from anywhere in the monorepo:
pnpm release:notes              # Update release notes
pnpm release:notes:finalize     # Finalize release
pnpm release:publish <version>  # Publish release (version optional)
pnpm release:info               # Check status and deployment health
pnpm release:validate           # Validate configuration
pnpm release:plan-breaking      # Plan breaking change
```

### Remember

- ✅ **One-time setup:** `git config --global push.followTags true` (makes life easier!)
- ✅ Name branches properly (feat/, fix/, breaking/, refactor/, test/, build/, ci/, perf/)
- ✅ Document as you go with `pnpm release:notes`
- ✅ Create migration guides BEFORE breaking changes with `pnpm release:plan-breaking`
- ✅ Use Cursor AI to update documentation
- ✅ Check deployment health with `pnpm release:info`
- ✅ Commit docs to your feature branch
- ✅ Merge to main, GitHub Actions handles the rest
- ✅ Tags must be pushed (use `push.followTags` or push manually)

---

**That's it!** The release system is designed to be systematic and automated. Follow the branch naming convention, use the tools, and let Cursor AI handle the documentation. 🚀
