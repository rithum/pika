# Changelog

All notable changes to the Pika Framework will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] - 2025-10-28

### Added

- **Dynamic Spotlight Widget Registration** - Web components can programmatically register themselves in spotlight at runtime
    - **`manuallyRegisterSpotlightWidget()` Method** - Register widgets without database tag definitions
        - Simplified `SpotlightWidgetDefinition` interface (tag, scope, tagTitle, customElementName, sizing)
        - Ephemeral registration - doesn't persist across page refreshes
        - `autoCreateInstance` flag controls automatic display (default: true)
        - `singleton` flag enforces single instance (default: true)
        - `showInUnpinnedMenu` controls visibility in add widget menu (default: true)
        - `displayOrder` controls position in spotlight sidebar
        - Perfect for components that need dynamic registration based on runtime conditions
    - **Use Cases**
        - Third-party integrations that register components programmatically
        - Conditional widgets that only appear when certain conditions are met
        - Development and testing without database tag management
        - Components that need to control their own spotlight presence
        - Base widgets that spawn multiple saved instances (Virtual Tags Pattern)
    - **Integration with Existing Systems**
        - Merges seamlessly with database-sourced tag definitions
        - Respects user preferences (unpinning, ordering)
        - Works with `renderTag()` to pass initial data
        - Compatible with Widget Instance Registry for tracking
        - Supports all spotlight features (unpinning, deletion, reordering)
- **Context-Aware Widgets** - Intelligent, dynamic context sharing from web components to AI assistants
    - **Widget Context API** - Widgets implement `getContextForLlm()` method to declare available context
        - Returns array of `ContextSourceDef` objects describing context sources
        - `sourceId` - Unique identifier for deduplication and tracking
        - `llmInclusionDescription` - Description for LLM-based relevance filtering
        - `title` and `description` - Human-readable labels for UI chips
        - `data` - The actual context content (any JSON-serializable value)
        - `addAutomatically` - Controls automatic vs manual context inclusion
        - `maxAgeMs` - Optional expiration time for time-sensitive context
        - `lucideIconName` - Optional icon for UI representation
        - `origin` - Tracks whether context was added automatically or by user
    - **Intelligent Context Filtering** - LLM-based pre-filtering reduces token costs and improves response quality
        - Amazon Nova Lite performs lightweight relevance filtering before main agent
        - Only relevant context sent to your agent based on user's question
        - User-requested contexts (`origin: 'user'`) always included without filtering
        - Automatic contexts (`origin: 'auto'`) filtered for relevance
    - **Smart Context Deduplication** - Session-level tracking eliminates redundant context
        - Content hashing (SHA-256) detects when context hasn't changed
        - Unchanged context isn't resent across conversation turns
        - Dramatically reduces token usage in multi-turn conversations
        - Tracks sent contexts per session in `sentContexts` record
    - **Staleness Detection** - Time-based context expiration for fresh data
        - `maxAgeMs` defines how long context stays relevant
        - Expired context automatically resent even if unchanged
        - Perfect for real-time data (stock prices, system status, metrics)
        - `maxAgeMs: 0` forces context to be included every time
        - `maxAgeMs: undefined` means context never expires (stable data)
    - **User Transparency & Control** - Full visibility into what context is being used
        - Context chips appear in chat input showing active contexts
        - Users can see context title, description, and icon
        - Remove auto-added contexts that aren't relevant
        - Manually add contexts the system didn't select
        - "Add Context" menu lists all available contexts from visible widgets
    - **Session-Level Context Tracking** - Complete audit trail of context usage
        - `SentContextRecord` tracks which contexts sent in which messages
        - Records: sourceId, messageIds, contentHash, lastSentAt, origin
        - Enables debugging, analytics, and cost attribution
        - Stored in chat session's `sentContexts` field
    - **Widget Lifecycle Integration** - Automatic context registration and updates
        - `chatAppState.updateWidgetContext(instanceId)` notifies system of context changes
        - Call after data loads, changes, or becomes available/unavailable
        - System automatically calls `getContextForLlm()` to discover current context
        - Context chips automatically appear/disappear as widgets mount/unmount
    - **New UI Components** - Enhanced chat input with context management
        - `context-chip.svelte` - Visual representation of context sources
        - `add-context-menu.svelte` - Menu for manually adding contexts
        - `auto-context-dropdown.svelte` - Dropdown showing auto-added contexts
        - Seamless integration with existing chat input component
    - **Backend Context Processing** - Server-side filtering and session management
        - `filterLLMContextItems()` in `instruction-augmentation.ts` handles filtering logic
        - Checks session history to skip unchanged contexts
        - Validates context age against `maxAgeMs` expiration
        - Calls LLM to filter auto-contexts for relevance
        - Updates `sentContexts` record after contexts sent to agent
    - **Type Safety** - Comprehensive TypeScript interfaces for context system
        - `ContextSourceDef` - Widget-provided context definition
        - `WidgetContextSourceDef` - Extended with instanceId for tracking
        - `ContextSource` - Union type for all context source types
        - `LLMContextItem` - Context item as sent to backend
        - `SentContextRecord` - Session tracking record
        - `WidgetContextSourceOrigin` - 'auto' or 'user' origin type
- **Comprehensive Context Documentation** - Four new docs following Diátaxis framework
    - [Context-Aware Widgets Capability](/capabilities/customization/context-aware-widgets/) - High-level overview and benefits
        - Real-world use cases (customer support, financial analysis, admin tools)
        - Key benefits (reduced costs, improved quality, better UX, future-proof)
        - Technical highlights (hashing, pre-filtering, session tracking)
    - [Provide Context from Widgets Guide](/guides/customization/widget-context/) - Step-by-step implementation
        - Basic implementation with getContextForLlm()
        - Context change notifications with updateWidgetContext()
        - Field guidelines and best practices
        - Multiple context items, conditional context, advanced patterns
        - Testing and troubleshooting
    - [Widget Context API Reference](/reference/types/widget-context/) - Complete API documentation
        - Core interfaces with detailed field documentation
        - Chat app state methods for context management
        - Validation rules and usage examples
        - Internal types for understanding system behavior
    - [AI-Driven UI Architecture](/why/approach/ai-driven-ui/) - Philosophical explanation
        - Comparison with traditional monolithic chat apps
        - Benefits of decentralized widget architecture
        - Why teams resist this approach and why it's worth it
        - Real-world examples demonstrating the paradigm shift
- **Widget Metadata in renderTag()** - Pass widget metadata directly when rendering
    - New optional `metadata` parameter in `renderTag()` method
    - Set widget title, icon, actions, and loading status at render time
    - Alternative to calling `setOrUpdateWidgetMetadata()` separately
    - Supports `WidgetMetadata` interface with title, lucideIconName, iconSvg, iconColor, actions, and loadingStatus
    - Particularly useful for spotlight widgets where metadata is needed immediately
    - Example: `renderTag('acme.widget', 'spotlight', data, { title: 'My Widget', lucideIconName: 'settings' })`
- **Auto-Enabled Canvas and Dialog Contexts** - Flexible rendering without explicit tag configuration
    - Canvas and dialog contexts now auto-enable when requested via `renderTag()`
    - No longer requires explicit `renderingContexts` configuration in tag definitions
    - System logs warning and dynamically enables context for programmatic renders
    - Inline and spotlight contexts still require explicit configuration
    - Provides flexibility for web components to render other components in canvas/dialog
    - Especially useful for manually registered spotlight widgets using `manuallyRegisterSpotlightWidget()`
- **Enhanced Singleton Documentation** - Clearer guidance on multi-instance widgets
    - Expanded documentation explaining `singleton: false` use cases
    - Virtual Tags Pattern for saved configurations (charts, dashboards, reports)
    - Multiple monitors showing same widget with different data
    - Comparison views with side-by-side instances
    - Workspace customization with multiple instances
    - Clear distinction between singleton (default) and multi-instance behavior

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
