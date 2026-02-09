# Changelog

All notable changes to the Pika Framework will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.19.2] - 2026-02-09

### Fixed

- **Chat Titlebar Blocked by Content** - Settings and navigation buttons in the chat titlebar were inaccessible due to content overlapping
    - Added proper z-index stacking to the chat titlebar so it stays above scrolling content
    - Fixed main layout container to use flex-based sizing (`flex-1 min-h-0`) instead of fixed height, preventing content overflow

---

## [0.19.1] - 2026-02-05

### Fixed

- **CLI Sync: Framework-Internal File Leak** - `pika sync` no longer delivers framework-internal files to user projects
    - `.github/` directory, `RELEASING.md`, and `RELEASE-SYSTEM-SUMMARY.md` were incorrectly synced via the new first-time delivery logic
    - Added `.github/**` to the directory skip list and a dedicated file-level check for framework-internal files
    - Separated directory skip logic (glob patterns) from file skip logic (explicit basename list) to prevent false positives

- **CLI Create-App: Missing Artifact Cleanup** - `pika create-app` now removes `RELEASING.md` and `RELEASE-SYSTEM-SUMMARY.md` from new projects
    - These framework release process documents were not included in the cleanup list

### Changed

- **CLI Package Published** - Published pika-app CLI version 1.4.4 to npm
    - Run `npm install -g pika-app@latest` to get the updated CLI

---

## [0.19.0] - 2026-02-05

### Added

- **Custom Logout Dialog** - Registry pattern to replace the default logout dialog with a custom Svelte component
    - Create a custom Svelte component with full control over appearance, actions, and pre-logout operations
    - Register via `$lib/custom/logout-dialog.ts` - export your component or `null` to use the default
    - Component receives `open`, `onOpenChange`, `logoutFeature`, and `stage` props
    - Access `AppState` via `getContext('appState')` for user data, custom data, and feature configuration
    - Typed props contract via exported `CustomLogoutDialogProps` interface
    - New documentation: [Custom Logout Dialog](/guides/customization/custom-logout-dialog/)

- **Client Lifecycle Hooks** - Extension points for running custom client-side code during page load and polling
    - `onInit` hook runs once during layout initialization for one-time setup (e.g., fetching external session data)
    - `onPoll` hook runs on each polling interval to keep client-side state current
    - Both hooks receive `appState`, `stage`, and SvelteKit's `fetchFn` for environment-aware API calls
    - Store fetched data in `user.customData` via `appState.updateUser()` for use across extension points
    - Configure in `$lib/custom/client-lifecycle.ts` - export functions or `null` to disable
    - New documentation: [Client Lifecycle Hooks](/guides/customization/client-lifecycle-hooks/)

- **Logout Redirect Parameter** - `/logout-now` endpoint supports `redirect_to` query parameter for post-logout navigation
    - `redirect_to` parameter takes highest priority, then auth provider return, then default `/login`
    - Security validation rejects absolute URLs, protocol-relative URLs, javascript/data URLs, and path traversal
    - Enables custom logout dialogs to control where users land after logout (e.g., home page instead of login)

### Changed

- **CLI Sync: Protected Area First-Time Delivery** - Protected areas are now delivered on first sync when they don't exist locally
    - Previously, `pika sync` would skip all protected areas entirely, even on first setup
    - Now syncs protected files that don't exist yet, preserving existing files as before
    - Recurses into protected directories to find and deliver any missing files
    - Ensures new extension points (e.g., `client-lifecycle.ts`, `logout-dialog.ts`) are delivered to existing projects

- **CLI Package Published** - Published pika-app CLI version 1.4.0 to npm
    - Run `npm install -g pika-app@latest` to get the updated CLI

---

## [0.18.5] - 2026-01-26

### Added

- **Stage Placeholder in Web Component URLs** - Use `{{stage}}` placeholder in web component URLs for stage-specific deployments
    - Placeholder is automatically substituted with actual stage value at deploy time
    - Enables "build once, deploy to any stage" workflow for external web component hosting

### Changed

- **Tag Definition Custom Resource API** - Updated CloudFormation custom resource properties
    - Now uses `Stage` and `TagDefData` properties instead of `Action` and `TagDefinition`

---

## [0.18.4] - 2026-01-26

### Fixed

- Various widget system fixes

---

## [0.18.3] - 2026-01-25

### Fixed

- **Hero Restoration on Companion Mode Exit** - Hero now properly restores when closing canvas in companion mode
    - Tracks whether hero existed before companion mode started (not just visibility)
    - Handles widgets that call `hideHero()` before opening companion mode canvas
    - Hero automatically shows again when companion mode exits

- **Companion Mode Minimize Button Position** - Adjusted minimize button (>>) position to avoid overlapping with chat input

---

## [0.18.2] - 2026-01-25

### Changed

- **Hero Widget Persistence** - Hero widgets now persist in DOM when hidden via `hideHero()`
    - Web component stays alive (hidden via CSS) rather than being destroyed
    - Use `heroDidShow` event to refresh data when hero becomes visible again
    - Preserves widget state (scroll position, form inputs) across visibility changes

- **Companion Mode Titlebar** - Sidebar toggle and new chat icons now hidden when canvas widget is open in companion mode

### Fixed

- **Hero Widget Stability** - Fixed hero web component being destroyed when hidden
    - Hero no longer remounts when toggling visibility
    - Eliminates duplicate hero instances on show/hide cycles

- **Static Widget Re-injection** - Fixed static widgets being re-injected when toggling companion mode
    - Static widget tracking now persists in ChatAppState across component remounts
    - Prevents duplicate orchestrator/initializer instances

- **Widget Injection Race Conditions** - Added synchronous guards to prevent duplicate widget creation
    - Hero, canvas, and static widget injection now protected against concurrent injection attempts
    - Fixes edge case where effect could run twice before first injection completed

- **Layout Stability** - Fixed chat component remounting when toggling companion mode
    - Children now rendered in stable DOM location using CSS flex-direction for layout changes
    - Prevents widget state loss during companion mode transitions

---

## [0.18.1] - 2026-01-25

### Fixed

- **Hero Minimized Position** - Collapsed hero now moves to top-left position alongside spotlight

---

## [0.18.0] - 2026-01-24

### Added

- **Intent Router** - Fast LLM-based command classification for instant responses (~200-400ms)
    - Intercepts user messages before Bedrock agent, routes to handlers for known intents
    - Uses Claude 3 Haiku for fast classification with configurable confidence threshold
    - Two execution modes: `direct` (execute command immediately) and `dispatch` (send to orchestrator widget)
    - Template interpolation with `{{context.x.y}}` syntax for dynamic responses
    - Commands defined on tag definitions via `intentRouterCommands` array
    - Orchestrator pattern for complex command logic with `registerIntentRouterHandler()`
    - Admin UI for managing commands at `/admin/tag-definitions`
    - Mock classifications support for local development

- **Collapsible Hero Widget** - Hero can now collapse to a compact header bar
    - `collapseHero()`, `expandHero()`, `toggleHeroCollapsed()` API methods
    - `heroCollapsed` property to check collapsed state
    - User-friendly collapse/expand button in hero chrome

- **Hero Sizing Configuration** - Control hero widget dimensions via tag definition
    - `minWidth`, `maxWidth` constraints (defaults: `200px`, `90%`)
    - `minHeight`, `maxHeight` constraints (defaults: `100`, `600` pixels)
    - Optional `width`, `height` for fixed dimensions
    - Hero container always horizontally centered

- **Suggest Question API** - Pre-fill chat input for AI helper buttons
    - `suggestQuestion(text, options?)` method on ChatAppState
    - Options: `focus`, `highlight`, `expandChatPane` (all default to true)
    - Automatically expands chat pane in companion mode
    - `questionSuggested` event for input highlight animation

- **Widget Ready Event** - Signal when widget has finished initializing
    - `signalWidgetReady(instanceId)` method for widgets to signal readiness
    - `widgetReady` event for coordinating sequential widget interactions
    - Prevents race conditions when sending commands to loading widgets

- **Hero Lifecycle Events** - Detailed events for hero state changes
    - `heroWillShow`, `heroDidShow` - Before/after hero becomes visible
    - `heroWillHide`, `heroDidHide` - Before/after hero is hidden
    - `heroCollapse`, `heroExpand` - When hero collapses/expands

- **Spotlight Events** - `spotlightShow`, `spotlightHide` events

- **Widget Tag ID in Context** - `ctx.tagId` automatically provided to widgets
    - No need to hardcode tag IDs in widget code
    - Useful for Intent Router handler registration

- **`bg-gray-25` Theme Color** - Nearly off-white background for subtle differentiation
    - Light mode: `oklch(0.9901 0.0013 90)`
    - Dark mode: `oklch(0.16 0.025 258)`
    - Used in companion mode chat pane styling

### Changed

- **Hero Context Configuration** - Extended `HeroContextConfig` with `sizing` property
- **Spotlight Initialization** - Now checks resolved widgets (respecting user preferences) for `startCollapsed`
- **TooltipPlus Component** - Added `side`, `sideOffset`, `contentClass` props for positioning control
- **Weather Sample** - Updated with hero widget demonstrating command quick actions

**Find All Type Changes for This Release:**

[Search the repository](https://github.com/rithum/pika/search?q=%40since+0.18.0) for @since 0.18.0 to find all type definitions that were added, updated, or removed in this release.

---

## [0.17.0] - 2026-01-21

### Added

- **Hero Rendering Context** - New singleton widget area for dominant display elements
    - Renders prominently below spotlight, above chat input
    - API-controlled visibility via `showHero()`, `hideHero()`, `closeHero()`
    - Unlike spotlight, hero can be completely destroyed and recreated
    - Configurable sizing with `minHeight`, `maxHeight`, `preferredHeight`

- **Companion Mode** - Application-first UX where canvas widgets become primary
    - Enable via `companionMode: true` in canvas widget options
    - Chat pane becomes compact with reduced padding and font sizes
    - Spotlight and hero widgets hidden during companion mode
    - Chat history minimized to focus on canvas widget

- **Chat Pane Minimize** - Users can minimize chat to a compact strip
    - Enable via `chatPaneMinimized: true` in canvas widget options
    - Minimized strip shows AI icon for easy expansion
    - `setChatPaneMinimized(boolean)` API for programmatic control
    - `isChatPaneMinimized` getter to check current state

- **Event System** - Subscribe to framework state changes
    - `widgetOpen` / `widgetClose` - Any widget lifecycle
    - `canvasOpen` / `canvasClose` - Canvas widget lifecycle
    - `companionModeEnter` / `companionModeExit` - Companion mode changes
    - `chatPaneMinimized` / `chatPaneExpanded` - Chat pane visibility
    - `heroShow` / `heroHide` - Hero widget visibility
    - Automatic cleanup when `instanceId` passed to `addEventListener()`

- **Full Control Canvas Widgets** - Widgets can render their own chrome
    - Enable via `fullControl: true` in canvas widget options
    - Framework hides title bar, widget provides its own UI
    - `requestCanvasClose()` to trigger framework close with confirmation

- **Close Configuration** - Configure canvas close behavior
    - `confirmOnClose` to show confirmation dialog
    - `confirmTitle`, `confirmMessage` for custom dialog content
    - `confirmButtonLabel`, `cancelButtonLabel` for custom button text
    - Works with both framework chrome and `fullControl` widgets

### Changed

- **renderTag Context** - Now accepts `'hero'` as valid rendering context
- **Canvas Widget Options** - Extended with `companionMode`, `fullControl`, `closeConfig`

**Find All Type Changes for This Release:**

[Search the repository](https://github.com/rithum/pika/search?q=%40since+0.17.0) for @since 0.17.0 to find all type definitions that were added, updated, or removed in this release.

### Migration

See [Upgrading to 0.17.0](/platform/releases/migration-guides/upgrading-to-0-17-0/) for detailed migration instructions.

## [0.16.8] - 2026-01-20

### Changed

- **CLI Package Published** - Published pika-app CLI version 1.3.1 to npm with sync fixes from 0.16.6 and 0.16.7
    - Run `npm install -g pika-app@latest` to get the updated CLI

## [0.16.7] - 2026-01-20

### Fixed

- **Sync Protected Areas Config Loading** - Fixed `__dirname` error preventing protected areas config from loading
    - The CLI uses ES modules where `__dirname` is not available, causing the protected areas config file to fail to load
    - Added ES module compatible `__dirname` using `fileURLToPath(import.meta.url)`
    - Added `apps/pika-chat/src/lib/custom/**` and `apps/pika-chat/static/custom/**` to fallback protected areas list
    - Ensures custom directories are always protected even if config file cannot be loaded

## [0.16.6] - 2026-01-19

### Fixed

- **Sync Protected Areas Bug** - Fixed glob patterns not protecting parent directories
    - Pattern `path/to/custom/**` now correctly protects the `custom` directory itself, not just its contents
    - Previously, directories matching the parent of a `/**` glob would be deleted during sync

## [0.16.5] - 2026-01-19

### Added

- **`destructive-bg` Theme Variable** - Added missing semantic background color for destructive/error states
    - Completes the semantic color pattern: `success-bg`, `warning-bg`, `info-bg`, `ai-bg`, `destructive-bg`
    - Light mode default: `oklch(0.95 0.08 25)` (light red)
    - Dark mode default: `oklch(0.25 0.10 25)` (dark red)
    - Use for error alerts, validation messages, and destructive action backgrounds

### Changed

- **Documentation** - Updated theming guide to use `destructive-bg` instead of legacy `danger-bg` name

## [0.16.4] - 2026-01-19

### Added

- **Home Page Redesign** - Complete redesign of the AI Assistants landing page with modern, marketing-focused layout
    - Clean header with customizable logo, title, and settings menu
    - Hero section with configurable subtitle text
    - Card-based assistant grid with hover effects and "Launch Assistant" CTA
    - Search bar that auto-appears when 6+ assistants are available
    - Configurable logo with light/dark mode support (`logo`, `logoHeight`, `logoGap`)
    - New `subtitle` property replaces deprecated `welcomeMessage`
    - `navigationButtonText` to customize sidebar return button (default: "AI Assistants")
    - `searchEnabled` option: `true`, `false`, or `'auto'` (shows at 6+ assistants)

- **Custom Assistant Icons** - Per-assistant icon customization on home page cards
    - `icon` property on `ChatAppLite` interface for assistant-specific icons
    - `defaultAssistantIcon` in `HomePageSiteFeature` for global default icon
    - `assistantIconSize` to control icon size inside card containers (default: 24px)
    - New default AI sparkles SVG icon at `/default-ai-sparkles.svg`

- **Custom Header Icon** - Customize or replace the AI sparkle icon in chat app headers
    - `chatAppHeaderIcon` in theme config - single URL or `{ light, dark }` object
    - CSS variables for fine control: `chat-app-icon`, `chat-app-header-icon-height`, `chat-app-header-icon-gap`
    - Automatic dark mode switching via MutationObserver

- **Protected Assets Directory** - New `apps/pika-chat/static/custom/assets/` directory
    - Protected from `pika sync` updates for safe storage of custom logos and icons
    - Files served at `/custom/assets/` URL path

**Find All Type Changes for This Release:**

[Search the repository](https://github.com/rithum/pika/search?q=%40since+0.16.4) for @since 0.16.4 to find all type definitions that were added, updated, or removed in this release.

### Changed

- **"Chat Apps" renamed to "AI Assistants"** - Updated terminology throughout the application
    - Home page title defaults to "AI Assistants"
    - Navigation button defaults to "AI Assistants" instead of "Home Page"
    - Card CTA changed from "Start Chat" to "Launch Assistant"
- **Settings Dropdown Menus** - Improved visual design using proper shadcn `DropdownMenu.Label` components
    - Removed awkward background box around user info
    - Cleaner integration with dropdown menu styling
- **Documentation** - Comprehensive updates to UI customization guide
    - Added visual layout diagram showing all configuration options
    - Complete examples with grouped settings by purpose
    - New sections for logo, icon, and access control customization

### Deprecated

- `welcomeMessage` in `HomePageSiteFeature` - Use `subtitle` instead

## [0.16.3] - 2026-01-19

### Changed

- **Theme File Organization** - Simplified theme file structure for clearer workflow
    - Renamed `theme-config.ts` to `sample-purple-theme.ts` to clarify it's a sample to copy
    - Removed redundant `examples/` folder (sample theme serves as the example)
    - Updated documentation with new "copy and customize" workflow

### Fixed

- **Theme Vite Plugin** - Fixed config loading to use proper TypeScript module resolution
    - Now uses jiti to load pika-config.ts and theme config instead of regex parsing
    - Properly reads `themeConfigPath` from pika-config.ts dynamically
- **Theme CLI Commands** - Fixed hardcoded theme path references
    - `pika theme check/update/list` now read the actual `themeConfigPath` from config
    - `pika sync` theme schema check now uses configured path
- **Release Tool** - Fixed version detection using stale local main branch
    - Now reads from `origin/main` instead of local `main` for accurate latest version

## [0.16.2] - 2026-01-19

### Fixed

- **Release Tooling** - Improved release prompt templates to ensure complete documentation updates
    - Release prompts now require updating `index.mdoc` for ALL releases (not just breaking changes)
    - Added missing 0.16.0 and 0.16.1 content to releases overview page

## [0.16.1] - 2026-01-19

### Fixed

- **Documentation Build Error** - Fixed theming guide causing Astro build failures
    - Corrected markdoc syntax from `{% tab %}` to `{% tabitem %}` in theming documentation
    - Added UI Theming guide to sidebar navigation under Guides → Customization

## [0.16.0] - 2026-01-19

### Added

- **UI Theming System** - Complete theming system for customizing colors, typography, and visual styling
    - New `customTheme` configuration in `siteFeatures.uiCustomization` to enable custom themes
    - Sample theme at `apps/pika-chat/src/lib/custom/sample-purple-theme.ts` - copy and customize for your brand
    - Semantic CSS variables for brand colors (`primary`, `secondary`, `destructive`), surfaces (`background`, `card`, `muted`), borders, status colors (`success`, `warning`, `info`, `ai`), sidebar, and charts
    - OKLCH color format for perceptually uniform, accessible color palettes
    - Full dark mode support with separate light/dark variable definitions
    - Custom color palettes for brand-specific shade variations
    - Hot Module Replacement (HMR) - theme changes take effect immediately without restart
    - Custom directory at `apps/pika-chat/src/lib/custom/` for theme files, protected from `pika sync`
    - Comprehensive theming documentation with visual references and examples

- **Theme CLI Commands** - New `pika theme` command for theme management
    - `pika theme check` - Verify theme schema version and see available updates
    - `pika theme update` - Add new theme variables when framework updates introduce them
    - `pika theme list` - Display all available CSS variables with descriptions and defaults
    - `pika theme docs` - Quick reference for theming system and OKLCH color format

- **Theme Schema Versioning** - Future-proof theme configuration with version tracking
    - Schema version in theme config enables notification of new theme variables
    - CLI commands help upgrade themes when new variables are added
    - Backward compatible - themes continue working without changes

- **Web Component Theme Access** - Programmatic access to theme values for custom components
    - `getThemeVariable(name)` - Read individual CSS variable values from the document
    - `getPikaThemeTokens()` - Get all semantic theme tokens as an object for use in web components
    - Enables consistent theming across embedded Pika components in host applications

**Find All Type Changes for This Release:**

[Search the repository](https://github.com/rithum/pika/search?q=%40since+0.16.0) for @since 0.16.0 to find all type definitions that were added, updated, or removed in this release.

### Changed

- **UI Consistency Improvements** - Standardized styling across admin components
    - Config section components updated for consistent visual treatment
    - Feature renderer components refined for better visual hierarchy
    - Session insights and analytics components polished for improved readability

### New TypeScript Interfaces

- `ThemeConfig` - Main theme configuration interface (`@since 0.16.0`)
- `CustomThemeConfig` - Configuration for enabling custom themes (`@since 0.16.0`)
- `SemanticColorVariable` - Type-safe semantic color variable names (`@since 0.16.0`)
- `ThemeSchemaChange` - Schema change tracking interface (`@since 0.16.0`)
- `ThemeVariableDoc` - Theme variable documentation interface (`@since 0.16.0`)
- `UiCustomizationFeature.customTheme` - New property for theme configuration (`@since 0.16.0`)
- `getThemeVariable()` - Function to read CSS variables (`@since 0.16.0`)
- `getPikaThemeTokens()` - Function to get all theme tokens (`@since 0.16.0`)

## [0.15.7] - 2026-01-14

### Fixed

- **KMS Key Tagging** - Fixed KMS key creation to always include required tags for IAM policy conditions
    - KMS keys now always include Project, Stage, and Purpose tags required for tag-based IAM policy conditions
    - Previously, keys created without component tags would fail IAM permission checks in ECS/container deployments
    - Added kms:GenerateDataKey permission to webapp IAM policy for cookie encryption operations
    - Changed KMS resource specification from wildcard to specific ARN pattern for better security

## [0.15.6] - 2026-01-14

### Fixed

- **KMS Permissions** - Fixed missing KMS permissions during initial key setup
    - Added required KMS permissions (TagResource, CreateAlias, GenerateDataKey, Decrypt, DescribeKey) for CDK deployment
    - Resolves permission errors during KMS key creation before tag-based conditions can apply
    - Ensures smooth infrastructure deployment without manual IAM intervention

## [0.15.5] - 2025-11-12

### Fixed

- **Chat session issue** - Fixed needing to refresh chat app state to see new messages
    - No longer need to refresh chat app state to see new messages

## [0.15.4] - 2025-11-04

### Fixed

- **Opensearch Type Issue** - Fixed minor opensearch type issue
    - Fixed issue where metrics were not corectly being transformed on way in/out of opensearch

## [0.15.3] - 2025-11-04

### Added

- **Cost Distribution Charts** - Added cost distribution charts to session analytics
    - Added cost distribution charts to session analytics

### Fixed

- **Auto Insights Runaway Issue** - Fixed auto insights runaway issue
    - Fixed data corruption issue allowing auto insights to run indefinitely (made self healing)

## [0.15.2] - 2025-11-03

### Fixed

- **Analtyics Backfill Tool** - Fixed analtyics tool flushing issuenot flushing messages to OpenSearch
    - Fixed issue where analytics tool was

## [0.15.1] - 2025-11-03

### Fixed

- **Backfill Tool** - Minor fix for robustness and performance of backfill tool
    - Fixed error handling and logging in backfill tool

## [0.15.0] - 2025-11-03

### Breaking Changes

- **Message Analytics & Search** - Enhanced session analytics with message-level insights and full-text message search
    - Requires running `update-session-mapping-for-messages.ts` tool BEFORE deployment
    - Adds `messages_summary` and `messages_analysis` fields to session index
    - If not run before deployment, OpenSearch will auto-index fields incorrectly
    - See [Migration Guide](https://pika.tools/platform/releases/migration-guides/upgrading-to-0-15-0)

### Added

- **Enhanced Session Analytics** - Dramatically improved user message analytics
    - Message-level metrics: total user messages, total assistant messages, average messages per session
    - Per-response cost and token metrics: average cost per response, tokens per response, execution duration
    - Timing analytics: response time, user think time, session duration, long gap detection
    - New time series chart showing user vs assistant message counts over time
    - Pre-computed statistics for 10-100x faster analytics queries
- **Message Content Search** - Session Insights search now includes message content
    - Search across message text, extracted LLM instructions, and model names
    - Returns sessions containing messages with matching terms
    - Seamless integration with existing session field search
- **Message Index** - New dedicated OpenSearch index for message documents
    - Full-text search on message content and LLM instructions
    - Searchable model field for filtering by AI model
    - Automatic replication from DynamoDB via Lambda stream handler
- **Migration Tools**
    - `update-session-mapping-for-messages.ts` - Update session index mapping (run BEFORE deployment)
    - `backfill-message-metadata/` - Backfill invocationMode and userType fields to existing messages
    - `backfill-messages-to-opensearch/` - Populate message index and session analytics fields

**Find All Type Changes for This Release:**

[Search the repository](https://github.com/rithum/pika/search?q=%40since+0.15.0) for @since 0.15.0 to find all type definitions that were added, updated, or removed in this release.

## [0.14.2] - 2025-11-02

### Improved

- **Admin Site Session Insights** - Improved admin site session insights feature

## [0.14.1] - 2025-11-01

### Fixed

- **Bedrock Inference Profile Stack Tags** - Fixed stack tags to ensure they are converted to required string type before being applied to Bedrock inference profiles

## [0.14.0] - 2025-11-01

### Added

- **Component Tags for Granular Cost Tracking** - Enhanced stack tagging system with component-level identification
    - New `componentTagNames` array in `stackTags` configuration enables tagging each infrastructure resource with its specific component name
    - Component tags applied to all AWS resources: Lambda functions, DynamoDB tables, S3 buckets, ECS clusters, Fargate services, KMS keys, OpenSearch domains, and Bedrock inference profiles
    - Enables granular cost analysis in AWS Cost Explorer - see costs for specific Lambda functions, DynamoDB tables, or inference profiles within each service
    - Example: Filter by AWS Lambda service, then group by `component` tag to see costs for `ConverseLambda`, `ChatbotApiLambda`, `KeyRotationLambda` separately
    - Particularly valuable for Bedrock costs - track which AI models (Claude 4 Sonnet, Claude 4.5 Haiku, etc.) consume the most
    - Helper method `applyComponentTags()` in custom-stack-defs.ts for easy tagging of custom infrastructure
    - Tag environment variable support for CloudFormation custom resources enables tagging of custom-created resources
    - New TypeScript property: `PikaConfig.stackTags.componentTagNames` with `@since 0.14.0` annotation
    - New documentation: Component Tags for Cost Tracking section in AWS CDK deployment guide
    - 500-byte limit enforced on combined tags overall size when CDK synth (docs include more details)

**Find All Type Changes for This Release:**

[Search the repository](https://github.com/rithum/pika/search?q=%40since+0.14.0) for @since 0.14.0 to find all type definitions that were added, updated, or removed in this release.

### Fixed

- **Inference Profile Tag Deduplication** - Fixed duplicate component tags causing Bedrock profile creation failures
    - Custom resource Lambda now properly deduplicates tags before creating inference profiles
    - Properties tags take precedence over environment variable tags when key conflicts occur
    - Prevents Bedrock API rejections due to duplicate tag keys

- **Custom Resource Re-invocation** - Fixed custom resources not updating on subsequent deployments
    - Added timestamp property to custom resources to force CloudFormation re-invocation on each deployment
    - Ensures tag updates and other changes are applied even when resource properties haven't changed

## [0.13.0] - 2025-10-31

### Added

- **Inference Profile Cost Tracking** - Automatic creation of named inference profiles for granular AI model cost analysis
    - Pika now automatically creates named inference profiles by copying AWS Bedrock's built-in profiles
    - Enables tracking costs for specific models (Claude 4 Sonnet, Claude 4.5 Haiku, Claude 4.5 Sonnet) in AWS Cost Explorer
    - Inference profiles follow naming pattern: `{stackName}-{profileName}` (e.g., `pika-test-claude-sonnet-4-5`)
    - All inference profiles are tagged with your configured `stackTags` for flexible cost allocation
    - Automatic component tagging for each profile (e.g., `component: Claude4_5SonnetInferenceProfile`)
    - Created during backend stack deployment with no additional configuration required
    - New documentation: [Track AI Model Costs](/guides/admin/track-costs/) guide and [Inference Profile Names](/reference/configuration/inference-profiles/) reference

- **AWS Resource Tagging System** - Comprehensive tagging support for cost tracking, organization, and compliance
    - New `stackTags` configuration in `pika-config.ts` with three tag categories: `common`, `pikaServiceTags`, `pikaChatTags`
    - Dynamic placeholder support for tag values (e.g., `{stage}`, `{timestamp}`, `{accountId}`, `{region}`, `{pika.projNameKebabCase}`)
    - Tags applied to all AWS resources in CDK stacks including Lambda, DynamoDB, S3, CloudFront, and inference profiles
    - Automatic filtering of AWS system tags (`aws:*`, `cloudformation:*`) for inference profiles
    - Tag merging rules: stack-specific tags overwrite common tags on key conflicts
    - New TypeScript interface: `PikaConfig.stackTags` with `@since 0.13.0` annotation
    - New documentation: [Configure AWS Resource Tags](/guides/deployment/aws-resource-tags/) guide and [Stack Tags Configuration](/reference/configuration/stack-tags/) reference

- **Markdown Renderer Factory** - Centralized markdown-to-HTML conversion with caching
    - New factory function for creating and caching markdown-it renderer instances
    - Configurable options: HTML support, linkify, typographer, line breaks, syntax highlighting
    - Cache key support for different highlight function configurations
    - Available in web components via `appState.convertMarkdownToHtml(markdown, config?)`
    - New TypeScript interfaces: `MarkdownRendererConfig` and `IAppState.convertMarkdownToHtml()` with `@since 0.13.0` annotations
    - New documentation: [Markdown Conversion API](/reference/api/markdown-conversion/) reference

**Find All Type Changes for This Release:**

[Search the repository](https://github.com/rithum/pika/search?q=%40since+0.13.0) for @since 0.13.0 to find all type definitions that were added, updated, or removed in this release.

### Changed

- **Custom Resource Lambda Functions** - Refactored to use shared utilities
    - Agent custom resource now uses lambda-custom-resource-util helpers
    - Chat app custom resource now uses lambda-custom-resource-util helpers
    - Memory custom resource now uses lambda-custom-resource-util helpers
    - Semantic directive custom resource now uses lambda-custom-resource-util helpers
    - Tag definition custom resource now uses lambda-custom-resource-util helpers
    - Improved error handling and logging consistency across all custom resources

- **AWS CDK Deployment Documentation** - Updated with tagging information
    - Added references to new inference profile cost tracking feature
    - Included information about automatic resource tagging

### Fixed

- Domain index Lambda now properly handles case sensitivity in domain comparisons

## [0.12.0] - 2025-10-31

### Added

- **Entity List Value Retrieval** - New required method for entity implementations in custom-data.ts
    - Added `getValuesForEntityList()` method to fetch entity display names by ID
    - Complements existing `getValuesForEntityAutoComplete()` for complete entity data flow
    - Required for displaying entity names in session analytics and admin UI
    - Returns `SimpleOption[]` with value/label pairs for entity display
    - New TypeScript interfaces: `GetValuesForEntityListRequest` and `GetValuesForEntityListResponse` with `@since 0.12.0` annotations
    - **Important**: When syncing from previous versions, this method must be manually added to `apps/pika-chat/src/routes/(auth)/api/site-admin/custom-data.ts`
    - Can return empty array or undefined if entity feature is not being used

**Find All Type Changes for This Release:**

[Search the repository](https://github.com/rithum/pika/search?q=%40since+0.12.0) for @since 0.12.0 to find all type definitions that were added, updated, or removed in this release.

### Changed

- **Session Analytics UI Improvements** - Enhanced admin site analytics interface
    - Improved visual design and layout of session analytics dashboard
    - Better organization of filters and controls
    - Enhanced date range selection with popup calendar
    - Improved chart rendering and data visualization
    - More intuitive entity filtering interface
    - Refined toggle groups for invocation mode and user type filters

### Fixed

- Session analytics entity display now properly shows entity names instead of IDs

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
    - See [Migration Guide](https://pika.tools/platform/releases/migration-guides/upgrading-to-0-11-0)

- **User Type Migration Required** - Chat sessions now include user type classification
    - Requires running `backfill-session-metadata/` tool to add `user_type` field to existing sessions
    - Enables filtering sessions by internal vs external users in analytics
    - See [Migration Guide](https://pika.tools/platform/releases/migration-guides/upgrading-to-0-11-0)

- **WidgetAction Callback Signature Changed** - Widget action callbacks now receive context object
    - Old: `callback: () => void | Promise<void>`
    - New: `callback: (context: WidgetCallbackContext) => void | Promise<void>`
    - Provides access to widget element, instanceId, and full PikaWCContext
    - Update all custom widget action callbacks to accept the context parameter
    - See [`WidgetCallbackContext` documentation](https://pika.tools/reference/ui-components/custom-components#WidgetCallbackContext)

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
    - `backfill-session-metadata/` - Add user type to existing chat sessions

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
    - Comprehensive documentation in [Building Web Components](https://pika.tools/guides/customization/build-web-components#Accessing-All-Widget-Instances) guide

## [0.7.0] - 2025-10-24

### Added

- **Web Component Initialization Enhancement** - Direct property and attribute setting when rendering components
    - New `DataForWidget` interface with three reserved fields: `attributes`, `properties`, and `onReady`
    - `attributes` - Set as HTML attributes (stringified) and also as properties if they exist on the element
    - `properties` - Set as JavaScript properties only (not as HTML attributes), ideal for complex objects, arrays, functions
    - `onReady` - Callback invoked when component is created and ready, before it's added to the DOM
    - Provides element reference, instance ID, and full Pika context in the callback
    - Perfect for passing configuration, initial data, or complex objects to web components
    - Comprehensive documentation with examples in [Building Web Components](https://pika.tools/guides/customization/build-web-components#Initializing-Components-with-Data) guide

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
    - See [Migration Guide](https://pika.tools/platform/releases/migration-guides/upgrading-to-0-5-0)
- **Chat Session GSI Update** - Fixed session sorting and added source filtering
    - Updated `user-chat-app-index` to use composite sort key (`chat_app_sk` with format `chatAppId#source#lastUpdate`)
    - Added `source` field to distinguish user vs component-initiated sessions
    - Requires manual DynamoDB GSI replacement and data migration
    - See [Migration Guide](https://pika.tools/platform/releases/migration-guides/upgrading-to-0-5-0)
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
