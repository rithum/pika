# Changelog

All notable changes to the Pika Framework will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.1] - 2025-10-21

### Fixed

- S3 file content route now properly handles file retrieval with improved error handling
    - Added 50MB file size limit to prevent memory issues
    - Fixed route path structure for proper parameter handling
    - Implemented streaming with size checks for safer file loading

## [0.6.0] - 2025-10-21

### Added

- **S3 File Access for Web Components** - New `getS3TextFileContent()` method on `IChatAppState`
    - Secure retrieval of text files from Pika S3 bucket
    - No AWS credential management required for components
    - Supports JSON, CSV, TXT, XML, and other text-based files
    - Authentication and bucket restrictions enforced server-side
    - Perfect for loading configuration files, data files, or content

## [0.5.2]

### Fixed

- Instruction augmentation prompt now correctly reads "return an empty array" instead of "return and empty array"
- Added logging to instruction augmentation for improved debugging

## [0.5.1]

### Fixed

- Interim chat sessions now properly include `source` field for consistent session tracking and filtering

## [0.5.0]

### Breaking Changes

- **Tag System Refactor** - Moved from `chatAppId` to `usageMode` model
    - Requires manual DynamoDB migration (GSI replacement)
    - See [Migration Guide](https://pika.tools/docs/releases/migration-guides/upgrading-to-0-5-0)
- **Chat Session GSI Update** - Fixed session sorting and added source filtering
    - Updated `user-chat-app-index` to use composite sort key (`chat_app_sk` with format `chatAppId#source#lastUpdate`)
    - Added `source` field to distinguish user vs component-initiated sessions
    - Requires manual DynamoDB GSI replacement and data migration
    - See [Migration Guide](https://pika.tools/docs/releases/migration-guides/upgrading-to-0-5-0)
- **Site Tag Configuration** - `tagsProhibited` renamed to `tagsDisabled`
    - Update site configuration to use new field name
    - Semantic change: disables global tags rather than prohibiting all tags
- **Tag Search API** - `TagDefinitionSearchRequest` interface updated
    - Removed `chatAppId` parameter (no longer used with new tag system)
    - Added `includeGlobal` boolean to optionally include global tags alongside specific tags

### Added

- **Custom Title Bar Actions** - Web components can register custom buttons and menus in chat app title bar
    - `setOrUpdateCustomTitleBarAction()` and `removeCustomTitleBarAction()` methods on `IChatAppState`
    - Enables widgets to add persistent global actions
    - Support for action groups with titles to organize related actions in menus
- **Static Widget Context** - New rendering context for widgets that run initialization code without visual UI
    - Optional `shutDownAfterMs` to auto-remove container after initialization
    - Perfect for registering title bar actions or other setup tasks
- **Release System** - Automated version tracking and breaking change warnings
    - `releases.json` metadata file for version history
    - `pika sync` now displays changelog and warns about breaking changes
    - Migration guide links when breaking changes detected
- **Agent Tool Management** - Mixed pattern support for tool definitions
    - Made `agent.toolIds` optional - no longer required when defining new tools
    - Can now provide both `tools` (new definitions) and `agent.toolIds` (references) simultaneously
    - Three supported patterns: tools only, toolIds only, or mixed approach
    - Flexible tool management: reference existing tools while defining new ones
- **Widget Sizing Configuration** - Comprehensive sizing system for web components
    - Dialog preset sizes: `'fullscreen'` (95vw x 90vh), `'large'` (85vw x 80vh), `'medium'` (70vw x 70vh), `'small'` (50vw x 50vh)
    - Custom dialog dimensions with viewport-relative units or percentages
    - Inline auto-height support with `sizing.inline.height: "auto"` for content-driven sizing
    - Configurable fixed heights for inline widgets (defaults to 400px)
- Global tags automatically available to all chat apps
- Chat-app specific tags with explicit enablement
- New `scope-status-index` GSI for efficient tag queries
- `source` field on `InvokeAgentAsComponentOptions` to control session visibility

### Changed

- Tag availability now controlled by `usageMode` field ('global' or 'chat-app')
- Chat apps declare tag preferences via `tagsEnabled` and `tagsDisabled` configuration
- README now includes release and update information
- Feature documentation enhanced with detailed examples and usage patterns for:
    - Agent tool definition patterns (3 approaches: new tools, existing references, or mixed)
    - Tag visibility model (global vs chat-app tags)
    - Widget contexts and sizing options
    - Instruction assistance placeholder system

### Fixed

- Instruction assistance now properly handles global tags vs chat-app tags
    - Global tags included by default unless explicitly disabled
    - Chat-app tags only included when explicitly enabled
- Web component inline rendering supports configurable height (default 400px, supports "auto")

### Removed

- Mock tag definitions moved to graveyard (development artifacts)
- Debug console.log statements from instruction assistance utilities

## How to Use This Changelog

When running `pika sync`, the CLI will:

- Compare your current version to the latest
- Display relevant changelog entries
- Warn about breaking changes
- Link to migration guides when needed

## Version History

Releases will be documented here as they are created. The framework is currently in active development (0.x versions).
