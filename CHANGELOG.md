# Changelog

All notable changes to the Pika Framework will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0]

### Breaking Changes

- **Tag System Refactor** - Moved from `chatAppId` to `usageMode` model
    - Requires manual DynamoDB migration (GSI replacement)
    - See [Migration Guide](https://pika-framework.dev/docs/releases/migration-guides/upgrading-to-0-5-0)
- **Chat Session GSI Update** - Fixed session sorting and added source filtering
    - Updated `user-chat-app-index` to use composite sort key (`chat_app_sk` with format `chatAppId#source#lastUpdate`)
    - Added `source` field to distinguish user vs component-initiated sessions
    - Requires manual DynamoDB GSI replacement and data migration
    - See [Migration Guide](https://pika-framework.dev/docs/releases/migration-guides/upgrading-to-0-5-0)

### Added

- **Custom Title Bar Actions** - Web components can register custom buttons and menus in chat app title bar
    - `setOrUpdateCustomTitleBarAction()` and `removeCustomTitleBarAction()` methods on `IChatAppState`
    - Enables widgets to add persistent global actions
- **Static Widget Context** - New rendering context for widgets that run initialization code without visual UI
    - Optional `shutDownAfterMs` to auto-remove container after initialization
    - Perfect for registering title bar actions or other setup tasks
- **Release System** - Automated version tracking and breaking change warnings
    - `releases.json` metadata file for version history
    - `pika sync` now displays changelog and warns about breaking changes
    - Migration guide links when breaking changes detected
- **Agent Tool Management** - Mixed pattern support for tool definitions
    - Can now provide both `tools` and `agent.toolIds` simultaneously
    - Flexible tool management: reference existing tools while defining new ones
- Global tags automatically available to all chat apps
- Chat-app specific tags with explicit enablement
- New `scope-status-index` GSI for efficient tag queries
- Web component auto-height support with `sizing.inline.height: "auto"` configuration

### Changed

- Tag availability now controlled by `usageMode` field ('global' or 'chat-app')
- Chat apps declare tag preferences via `tagsEnabled` and `tagsDisabled` configuration
- README now includes release and update information

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
