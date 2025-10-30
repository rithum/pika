# Changelog

All notable changes to the Pika Framework will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.11.3] - 2025-10-30

### Fixed

- **pika-cli Sync Command** - Improved temp file handling and visual diff functionality
    - Changed temp directory location from project directory to OS temp directory
    - Added automatic cleanup of old `pika-sync-*` temp directories
    - Fixed `--visualdiff` mode to keep temp files available for editor review
    - Fixed visual diff command execution using spawn instead of exec for better argument handling
    - Added informative logging about temp file location when using `--visualdiff`
- **Site Admin General Settings** - Fixed page header right snippet not being assigned
- **OpenSearch Error Logging** - Improved error message logging for source filtering failures

## [0.11.2] - 2025-10-30

### Fixed

- **CI/CD Pipeline** - Fixed pnpm lockfile synchronization issue
    - Resolved `ERR_PNPM_OUTDATED_LOCKFILE` error in GitHub Actions workflows
    - Regenerated lockfile to sync dependency ordering with package.json files
    - Ensures successful frozen-lockfile installation in CI environments

## [0.11.1] - 2025-10-30

### Fixed

- **Site Admin Type Safety** - Improved TypeScript type handling in site admin pages
    - Removed unnecessary `as any` type casts for page header snippets
    - Fixed type safety in chat apps, general settings, instruction augmentation, memory, session analytics, and session insights pages
    - Cleaned up TODO comments about type fixes

## [0.11.0] - 2025-10-30

### Breaking Changes

- **OpenSearch Keyword Field Migration Required** - Session analytics now uses dedicated keyword fields for aggregations
    - Requires running `update-session-mapping.ts` to add new fields to OpenSearch index
    - Requires running `copy-to-keyword-fields.ts` to populate keyword fields for existing sessions
    - New fields: `invocation_mode_keyword`, `user_type_keyword`, `source_keyword`
    - Original text fields remain unchanged (additive-only migration)
    - See [Migration Guide](https://pika.tools/docs/platform/releases/migration-guides/upgrading-to-0-11-0)

- **User Type Migration Required** - Chat sessions now include user type classification
    - Requires running `add-user-type-to-chat-sessions.ts` to add `user_type` field to existing sessions
    - Enables filtering sessions by internal vs external users in analytics
    - See [Migration Guide](https://pika.tools/docs/platform/releases/migration-guides/upgrading-to-0-11-0)

- **WidgetAction Callback Signature Changed** - Widget action callbacks now receive context object
    - Old: `callback: () => void | Promise<void>`
    - New: `callback: (context: WidgetCallbackContext) => void | Promise<void>`
    - Provides access to widget element, instanceId, and full PikaWCContext
    - Update all custom widget action callbacks to accept the context parameter
    - See [`WidgetCallbackContext` documentation](https://pika.tools/docs/reference/ui-components/custom-components#WidgetCallbackContext)

### Added

- **Enhanced Session Analytics Dashboard** - Comprehensive analytics with advanced filtering and aggregations
    - Filter sessions by invocation mode (agent, tool, autonomous, component)
    - Filter sessions by user type (internal-user, external-user)
    - Filter sessions by source (user, component-as-user, component)
    - Cost aggregations by invocation mode with visual charts
    - Session count trends and distribution visualizations
    - Export session data with all filters applied

- **Widget Metadata System** - Dynamic UI chrome for widgets across all rendering contexts
    - Set title, icon, loading status, and custom actions for widgets
    - Metadata can be set initially via `renderTag()` or dynamically via `getWidgetMetadataAPI()`
    - Support for spotlight, canvas, and dialog widgets
    - Actions can be primary buttons or overflow menu items
    - Widget actions receive full context including element reference
    - `SpotlightWidgetDefinition` now includes optional `metadata` field

- **Dynamic Widget Registration for Canvas/Dialog** - No tag definitions required
    - Canvas and dialog rendering contexts now auto-generate tag definitions when needed
    - Eliminates need for manual tag definition creation during development
    - Auto-enables requested rendering context if tag exists but context is disabled
    - Seamlessly integrates with manually registered spotlight widgets

- **Widget Context API** - New method for accessing widget context
    - `getWidgetContext(instanceId)` returns full `PikaWCContext` for any widget instance
    - Enables widgets to access context from action callbacks
    - Provides element reference, instance ID, app state, and data

- **Type Organization Improvements** - Better TypeScript type definitions
    - Moved `WidgetAction`, `WidgetMetadata`, `WidgetMetadataState`, and `SpotlightWidgetDefinition` to `webcomp-types.ts`
    - Added `@since 0.11.0` annotations for all new and updated types
    - Improved JSDoc documentation for widget-related interfaces

- **Automatic User Profile Sync** - Framework automatically syncs updated user information from auth provider
    - Detects when auth provider returns updated `firstName` or `lastName` for existing users
    - Automatically updates `chat-user` table when profile information changes
    - No manual sync required - happens seamlessly during authentication
    - Ensures user display names stay current across the platform

- **Migration Tooling** - Scripts for data migration
    - `update-session-mapping.ts` - Add keyword fields to OpenSearch session index
    - `copy-to-keyword-fields.ts` - Copy data to keyword fields for existing sessions
    - `add-user-type-to-chat-sessions.ts` - Add user type to existing chat sessions

**Find All Type Changes for This Release:**

[Search the repository](https://github.com/rithum/pika/search?q=%40since+0.11.0) for @since 0.11.0 to find all type definitions that were added, updated, or removed in this release.

### Changed

- **Widget Metadata Flow** - Unified metadata management
    - Metadata from `renderTag()` is now copied to centralized `widgetMetadata` map after injection
    - `widgetMetadata.get(instanceId)` is now the single source of truth after initialization
    - Dynamic metadata updates via `getWidgetMetadataAPI()` immediately reflect in UI
    - Applies consistently across spotlight, canvas, and dialog contexts

- **Session Analytics Backend** - OpenSearch query improvements
    - All analytics queries now use keyword fields for aggregations
    - Added `_source` filtering to exclude keyword fields from results
    - Improved query performance with proper field type usage

### Fixed

- Canvas and dialog widgets now properly respect initial metadata provided to `renderTag()`
- Widget action button callbacks now receive proper context with element and instance references
- Metadata updates via `getWidgetMetadataAPI()` now immediately reflect in canvas and dialog renderers

## [0.10.0] - 2025-10-28

### Added

- **Dynamic Spotlight Widget Registration** - Web components can programmatically register themselves in spotlight at runtime
    - New `manuallyRegisterSpotlightWidget()` method for runtime widget registration
    - No database tag definitions required - perfect for development, testing, and dynamic scenarios
    - Configure via `SpotlightWidgetDefinition` interface: tag, scope, title, element name, and sizing
    - Control behavior with `autoCreateInstance`, `singleton`, `showInUnpinnedMenu`, and `displayOrder` options
    - Use cases: third-party integrations, conditional widgets, Virtual Tags Pattern
    - Integrates seamlessly with database-sourced tags and respects user preferences

- **Context-Aware Widgets** - Widgets can provide dynamic context to AI conversations
    - Implement `getContextForLlm()` method to declare available context sources
    - Intelligent LLM-based filtering automatically includes only relevant context
    - Smart deduplication via content hashing - unchanged context isn't resent
    - Time-based staleness detection with `maxAgeMs` for real-time data
    - User transparency with context chips showing active contexts in chat input
    - Users can manually add/remove contexts via "Add Context" menu
    - Call `chatAppState.updateWidgetContext(instanceId)` when context changes
    - Complete TypeScript interfaces: `ContextSourceDef`, `LLMContextItem`, `SentContextRecord`

- **Context Documentation** - Comprehensive guides for context-aware widgets
    - [Context-Aware Widgets Capability](/capabilities/customization/context-aware-widgets/) - Overview and benefits
    - [Provide Context from Widgets Guide](/guides/customization/widget-context/) - Implementation guide
    - [Widget Context API Reference](/reference/types/widget-context/) - API documentation
    - [AI-Driven UI Architecture](/why/approach/ai-driven-ui/) - Architectural philosophy

- **Widget Metadata in renderTag()** - Pass metadata directly when rendering
    - Optional `metadata` parameter sets title, icon, actions, and loading status at render time
    - Alternative to calling `setOrUpdateWidgetMetadata()` separately
    - Example: `renderTag('acme.widget', 'spotlight', data, { title: 'My Widget', lucideIconName: 'settings' })`

- **Auto-Enabled Canvas and Dialog Contexts** - Flexible rendering without explicit configuration
    - Canvas and dialog contexts auto-enable when requested via `renderTag()`
    - No longer requires explicit `renderingContexts` in tag definitions
    - Particularly useful for manually registered spotlight widgets

- **Enhanced Multi-Instance Widget Documentation** - Clearer guidance on `singleton: false`
    - Virtual Tags Pattern for saved configurations
    - Multiple monitors, comparison views, and workspace customization examples

## [0.9.0] - 2025-10-27

### Added

- **Complete Documentation Site Overhaul** - Brand new documentation experience built with Astro
    - Comprehensive documentation following Diátaxis framework (Tutorials, How-To Guides, Explanations, Reference)
    - New documentation structure:
        - **Why Pika** - Understanding the framework's approach and benefits
        - **Getting Started** - Installation, quickstart, hello world, and sample walkthrough
        - **Concepts** - Core philosophy, architecture, and how Pika works internally
        - **Capabilities** - Feature documentation organized by category (Core, Intelligence, Integration, Customization, Data & Memory, Enterprise)
        - **Guides** - Step-by-step how-to guides for agent development, authentication, customization, deployment, data management, admin tools, and intelligence features
        - **Reference** - API documentation, configuration reference, CLI commands, TypeScript types, and UI components
        - **Platform** - Community, contributing, releases, changelog, migration guides, and troubleshooting
    - Enhanced content with diagrams, code examples, and detailed explanations
    - Improved navigation with sidebar organization and search functionality
    - Custom Markdoc components for enhanced documentation presentation
    - Documentation generation prompt template for AI-assisted docs creation
- **Release Tooling Improvements** - Enhanced release management capabilities
    - Updated release prompt with comprehensive finalization workflow
    - Improved release.ts tooling for version management

## [0.8.0] - 2025-10-24

### Added

- **Widget Instance Registry** - Comprehensive tracking system for all rendered web components
    - Centralized registry accessible via `chatAppState.widgetInstances` Map
    - Tracks all widget types: spotlight, canvas, dialog, inline, and static contexts
    - Each instance includes: DOM element reference, instanceId, tagId, customElementName, renderingContext, tagDefinition, and creation timestamp
    - New public API methods: `registerWidgetInstance()`, `unregisterWidgetInstance()`, `getWidgetInstance()`
    - Automatic lifecycle tracking with proper cleanup when widgets are removed
    - Enables cross-widget communication, debugging, and programmatic widget manipulation
    - Memory leak prevention with automatic unregistration via Svelte `onDestroy` for inline widgets
    - Enhanced `injectChatAppWebComponent()` to return both `instanceId` and `element` reference
    - Comprehensive documentation in [Building Web Components](https://pika.tools/docs/developer/building-web-components#Accessing-All-Widget-Instances) guide

## [0.7.0] - 2025-10-24

### Added

- **Web Component Initialization Enhancement** - Direct property and attribute setting when rendering components
    - New `DataForWidget` interface with three reserved fields: `attributes`, `properties`, and `onReady`
    - `attributes` - Set as HTML attributes (stringified) and also as properties if they exist on the element
    - `properties` - Set as JavaScript properties only (not as HTML attributes), ideal for complex objects, arrays, functions
    - `onReady` - Callback invoked when component is created and ready, before it's added to the DOM
    - Provides element reference, instance ID, and full Pika context in the callback
    - Perfect for passing configuration, initial data, or complex objects to web components
    - Comprehensive documentation with examples in [Building Web Components](https://pika.tools/docs/developer/building-web-components#Initializing-Components-with-Data) guide

## [0.6.2] - 2025-10-22

### Fixed

- Chat input textarea now properly shrinks back to original size after submitting a question
    - Fixed textarea height reset behavior in chat input component
    - Ensures consistent UI appearance after message submission

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
