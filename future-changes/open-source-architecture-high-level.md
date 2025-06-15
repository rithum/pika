# Pika Framework Open Source Architecture - High Level Design

## 1. Pika CLI Tool (`pika-cli`)

### Implementation

```bash
# Install CLI globally
npm install -g pika-cli

# Use CLI commands
pika create-app my-chat-app
pika sync
```

### CLI Flow

1. **Project Setup Questions**

    - Project name and description
    - Include sample weather app? (Y/N)
    - Authentication strategy: [Mock, Auth.js, Custom, Enterprise SSO]
    - Service organization: [Monorepo, Separate Services]

2. **Template Generation**

    - Create new project directory (or use provided name)
    - Copy complete Pika framework codebase into directory
    - Generate customization scaffolding in designated areas
    - Initialize new git repository for user's project
    - Add .pika-sync.json for version tracking

3. **Post-Setup Instructions**
    - How to customize authentication
    - How to add custom components
    - How to sync framework updates with `pika sync`
    - Deployment guide links

## 2. Customization Architecture

### 2.1 Authentication System (`/apps/pika-chat/src/auth/`)

**Current**: Single `hooks.server.ts` with mocked authentication
**Proposed**: Pluggable authentication system

```
/apps/pika-chat/src/auth/
├── types.ts                 # Core auth interfaces (framework)
├── base-auth.ts            # Abstract base class (framework)
├── providers/              # User customization area
│   ├── mock-auth.ts        # Default mock (framework)
│   ├── auth-js.ts          # Auth.js integration (framework)
│   └── custom-auth.ts      # User implementation (user code)
└── index.ts                # Auto-discovery system (framework)
```

**Benefits**:

- Clear separation of framework vs user code
- Multiple built-in strategies
- Easy to extend and customize
- Doesn't conflict with upstream updates

### 2.2 Custom Markdown Component System (`/apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/`)

**Current**: Manual component imports in `markdown-message-renderer.svelte` with hardcoded componentMap for the built in markdown tag renderers
**Proposed**: Add a dynamic component discovery system for custom componenets

```
/apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/
├── markdown-message-renderer.svelte     # Main renderer (framework)
├── md-to-html-generator.ts              # Markdown processor (framework)
├── markdown-tag-components/             # Built-in components (framework)
│   ├── chart.svelte                     # Chart component (framework)
│   ├── chat.svelte                      # Chat component (framework)
│   ├── download.svelte                  # Download component (framework)
│   ├── image.svelte                     # Image component (framework)
│   └── prompt.svelte                    # Prompt component (framework)
├── custom-markdown-tag-components/      # User customization area (user code)
│   ├── index.ts                         # Component registry (user code)
│   ├── order.svelte                     # Custom order component (user code)
│   ├── invoice.svelte                   # Custom invoice component (user code)
│   └── product-card.svelte              # Custom product card (user code)
└── component-discovery.ts               # Auto-discovery system (framework)
```

**Current Implementation Issues**:

- Components manually imported: `import ChartComponent from './markdown-tag-components/chart.svelte'`
- ComponentMap hardcoded: `const componentMap = { prompt: PromptComponent, chart: ChartComponent, ... }`
- No way to add custom components without modifying framework code

**Proposed Dynamic System**:

- LLM can reference custom components: `<order id="12345" status="pending">...</order>`
- Automatic discovery of user components in `custom-markdown-tag-components/`
- Hot-reload during development
- Type-safe component props with auto-completion
- Component registry validates required props at runtime

### 2.3 Service Organization (`/services/`)

**Current**: Single services directory with manual `.gitignore` for capabilities/
**Proposed**: Structured service areas with clear conventions

```
/services/
├── pika/                   # Core framework service (framework)
├── samples/               # Sample implementations (framework)
│   └── weather/           # Weather demo service (framework)
└── custom/                # User services area (user code)
    ├── .gitkeep           # Keeps directory in git
    └── my-service/        # User's custom services (user code)
```

**Convention Rules**:

- **Core Services**: Any service directly in `/services/` (like `/services/pika/`) is framework code
- **Grouped Services**: Services in subdirectories are categorized:
    - `/services/samples/` - Framework-provided examples and demos
    - `/services/custom/` - User-created services for monorepo pattern
- **External Services**: Large organizations can create separate repositories that reference the Pika stack

**Benefits**:

- Simple, clear organization
- No complex `.gitignore` patterns needed
- Supports both monorepo and microservice architectures
- Framework updates never conflict with user services in `/services/custom/`

## 3. Upstream Synchronization Strategy

### 3.1 Synchronization Strategy

```bash
# User's project has its own git repository
# Sync command pulls updates from Pika framework
pika sync

# Or with options
pika sync --version latest
pika sync --version v2.1.0
pika sync --dry-run  # Preview changes
```

**Sync Process**:

1. Download latest Pika framework code
2. Identify files that have changed since last sync
3. Apply updates only to framework areas (never touch user customization areas)
4. Generate migration report if user code needs updates
5. Create git commit with sync changes
6. Update .pika-sync.json with new version info

### 3.2 Protected User Areas

Files/directories that are never modified by framework updates:

- `/apps/pika-chat/src/auth/providers/custom-auth.ts`
- `/apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/`
- `/services/custom/`
- Environment configuration files (`.env*`)
- User-specific configuration overrides (`pika.config.ts`)
- Version tracking file (`.pika-sync.json`)
- Any files matching user-defined ignore patterns

### 3.3 Migration System

When framework changes require user code updates:

- Migration scripts in `/scripts/migrations/`
- Clear migration guides in documentation
- Backwards compatibility for at least 2 major versions

## 4. Enhanced Developer Experience

### 4.1 Configuration System

```typescript
// /pika.config.ts (user customizable)
export default {
    auth: {
        provider: 'custom',
        options: {
            /* user-specific config */
        }
    },
    components: {
        customDirectory: './apps/pika-chat/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components',
        autoDiscovery: true
    },
    services: {
        organization: 'monorepo', // or 'external'
        customDirectory: './services/custom'
    }
};
```

### 4.2 Development Tools

- **Hot reload** for custom components
- **Type generation** for custom component props
- **Validation** for component registration
- **Development dashboard** showing registered components and auth status

### 4.3 Documentation System

- **Interactive setup guide**
- **Component development tutorial**
- **Authentication integration examples**
- **AWS deployment guides**
- **Migration guides** for framework updates

## 5. Implementation Priority

### Phase 1: Foundation

1. Create CLI tool package structure
2. Implement pluggable authentication system
3. Set up user customization directories
4. Configure proper `.gitignore` patterns

### Phase 2: Component System

1. Build dynamic component registry
2. Create sample custom components
3. Implement LLM component parsing
4. Add development tools for component creation

### Phase 3: Developer Experience

1. Enhanced documentation and guides
2. Migration system and scripts
3. Development dashboard
4. Automated testing for user customization areas

### Phase 4: Advanced Features

1. Advanced AWS deployment templates
2. Enterprise SSO integrations
3. Component marketplace/sharing
4. Advanced service orchestration patterns

## 6. File Structure Changes Required

### New Package: `/packages/pika-cli/`

- CLI tool implementation
- Template files and generators
- Setup and configuration logic
- Built-in sync tooling (`pika sync` command)

### Modified: `/apps/pika-chat/`

- Refactor authentication to pluggable system in `/src/auth/`
- Add component auto-discovery to markdown renderer
- Ensure `/src/lib/client/features/chat/markdown-message-renderer/custom-markdown-tag-components/` is created
- Update build system to include user customization areas

### Modified: `/services/`

- Ensure `/services/custom/` directory exists with `.gitkeep`
- Update any build scripts to handle user services

### Modified: Root Configuration

- Configure turbo.json for user services in `/services/custom/`
- Create `/scripts/migrations/` directory
- Document sync process and protected areas

This architecture provides a clear path for users to customize the framework while maintaining the ability to receive updates. The key is establishing clear boundaries between framework code and user code, with well-defined interfaces and conventions.
