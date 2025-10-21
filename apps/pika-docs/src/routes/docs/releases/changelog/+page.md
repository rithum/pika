# Changelog

Complete version history of the Pika Framework.

## [0.5.1]

### Fixed

- Interim chat sessions now properly include `source` field for consistent session tracking and filtering
    - Ensures all sessions created during chat app initialization have correct source attribution
    - Fixes filtering behavior when querying sessions by source type

---

## [0.5.0]

### Breaking Changes

- **Tag System Refactor** - Moved from `chatAppId` to `usageMode` model
    - DynamoDB schema changes required
    - GSI replacement: `chatappid-status-index` → `scope-status-index`
    - Chat app configuration updates needed
    - See [Migration Guide](/docs/releases/migration-guides/upgrading-to-0-5-0)
- **Chat Session GSI Update** - Fixed chronological sorting and added source filtering
    - Updated `user-chat-app-index` GSI with composite sort key
    - Sort key changed from `chat_app_id` to `chat_app_sk`
    - New format: `chatAppId#source#lastUpdate` (source is 'user' or 'component')
    - Enables correct chronological ordering and filtering by session source
    - Added `source` field to sessions to distinguish user vs component-initiated sessions
    - See [Migration Guide](/docs/releases/migration-guides/upgrading-to-0-5-0)
- **Site Tag Configuration** - `tagsProhibited` renamed to `tagsDisabled`
    - Update site configuration to use new field name
    - Semantic change: disables global tags rather than prohibiting all tags
- **Tag Search API** - `TagDefinitionSearchRequest` interface updated
    - Removed `chatAppId` parameter (no longer used with new tag system)
    - Added `includeGlobal` boolean to optionally include global tags alongside specific tags

### Added

- **Custom Title Bar Actions** - Web components can register custom buttons and menus in chat app title bar
    - New `setOrUpdateCustomTitleBarAction()` and `removeCustomTitleBarAction()` methods
    - Enables widgets to add persistent global actions visible across sessions
    - Supports both single actions and dropdown menus
    - Support for action groups with titles to organize related actions in menus
- **Static Widget Context** - New rendering context for widgets that execute initialization code
    - Runs once when chat app loads, no visual UI rendered
    - Optional `shutDownAfterMs` to auto-remove container after initialization
    - Perfect for registering title bar actions, setting up event listeners, or other setup tasks
    - Example: Register a title bar button without needing a visible widget
- **Release System Infrastructure** - Automated version tracking and breaking change detection
    - `releases.json` metadata file tracks version history and breaking changes
    - `pika sync` displays relevant changelog entries between versions
    - Automatic breaking change warnings with migration guide links
    - `--acknowledge-breaking-changes` flag for explicit upgrade consent
- **Agent Tool Management Enhancement** - Flexible tool definition patterns
    - Made `agent.toolIds` optional - no longer required when defining new tools
    - Mixed pattern: provide both `tools` (new definitions) and `agent.toolIds` (references) simultaneously
    - Create new tools while referencing existing ones in a single operation
    - Three supported patterns: tools only, toolIds only, or mixed approach
    - Clearer documentation of three supported patterns with examples
- **Widget Sizing Configuration** - Comprehensive sizing system for web components
    - Dialog preset sizes: `'fullscreen'` (95vw x 90vh), `'large'` (85vw x 80vh), `'medium'` (70vw x 70vh), `'small'` (50vw x 50vh)
    - Custom dialog dimensions with viewport-relative units or percentages
    - Inline auto-height support with `sizing.inline.height: "auto"` for content-driven sizing
    - Configurable fixed heights for inline widgets (defaults to 400px)
- **Global Tag System** - Tags automatically available to all chat apps
- **Chat-App Tags** - Explicit enablement for app-specific tags
- **Tag Configuration** - `tagsEnabled` and `tagsDisabled` in chat app config
- **Component Session Source** - `source` field on `InvokeAgentAsComponentOptions` to control session visibility

### Changed

- Tag availability now controlled by `usageMode` ('global' or 'chat-app')
- Built-in tags (chart, image, prompt) are now global by default
- README includes release and update documentation
- Web component inline rendering supports configurable height (defaults to 400px)
- Feature documentation enhanced with detailed examples and usage patterns for:
    - Agent tool definition patterns (3 approaches: new tools, existing references, or mixed)
    - Tag visibility model (global vs chat-app tags)
    - Widget contexts and sizing options
    - Instruction assistance placeholder system

### Fixed

- **Instruction Assistance Tag Filtering** - Properly handles global vs chat-app tag distinctions
    - Global tags now correctly included by default unless explicitly disabled
    - Chat-app tags only included when explicitly enabled
    - Fixes issue where global tags weren't appearing in agent instructions
- Web component renderer respects custom inline height configuration

### Removed

- Mock tag development artifacts (moved to graveyard)
- Debug logging from instruction assistance utilities

---

## [0.4.0] - 2025-10-20

Initial tracked release establishing baseline for version management.

### Framework Features

- Multi-agent collaboration
- User memory system
- Session management
- Tag-based UI components
- Site admin interface
- Entity-based access control
- Instruction assistance and augmentation
- AWS deployment infrastructure

### Developer Tools

- `pika-cli` for project scaffolding
- `pika sync` for framework updates
- Protected areas system
- Custom component support

---

## Version Schema

**While in 0.x (pre-1.0):**

- `0.x.0` → Breaking changes or major features
- `0.x.y` → Bug fixes and improvements

**After 1.0:**

- `x.0.0` → Breaking changes
- `x.y.0` → New features (backward compatible)
- `x.y.z` → Bug fixes

---

## How to Use This Changelog

When running `pika sync`, the CLI compares your `.pika-sync.json` version with the latest release and shows relevant changes.

### Check Your Version

```bash
cat .pika-sync.json | grep pikaVersion
```

### See What's New

```bash
# Preview changes without applying
pika sync --dry-run

# See detailed diffs
pika sync --diff
```

### Breaking Change Warnings

The sync tool will:

- Detect breaking changes between versions
- Display migration requirements
- Link to step-by-step guides
- Require explicit acknowledgment

---

## Legend

- 🔴 **Breaking** - Requires manual migration
- 🟢 **Added** - New features
- 🟡 **Changed** - Modified behavior
- 🔵 **Fixed** - Bug fixes
- ⚪ **Deprecated** - Will be removed soon
- 🟣 **Security** - Security improvements

---

## Stay Updated

```bash
# Regular updates
pika sync

# Check for breaking changes first
pika sync --dry-run
```

For migration guides, see [Migration Guides](/docs/releases/migration-guides).
