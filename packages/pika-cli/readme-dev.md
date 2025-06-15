# Pika CLI - Developer Implementation Guide

This document explains the conceptual architecture and implementation flow of the Pika CLI, focusing on what happens when users create and manage projects.

## 🏗 CLI Architecture Overview

### Core Components

```
CLI Entry Point (index.ts)
├── Commands (commands/)
│   ├── create-app.ts    # Project creation orchestrator
│   ├── sync.ts          # Framework update manager
│   ├── component.ts     # Custom component manager
│   └── auth.ts          # Authentication configurator
└── Utilities (utils/)
    ├── logger.ts        # Console output & UX
    ├── file-manager.ts  # File operations & templating
    ├── git-manager.ts   # Git repository operations
    ├── config-manager.ts # Project configuration
    ├── system-checker.ts # Environment validation
    └── template-manager.ts # Template processing
```

### Data Flow Philosophy

1. **User Input** → Interactive prompts gather requirements
2. **Validation** → System checks and input validation
3. **Generation** → Template-based file creation with variables
4. **Configuration** → Project config files and registries
5. **Initialization** → Git, dependencies, and final setup

## 🚀 `pika create-app` Flow Breakdown

### Phase 1: User Input Collection (`getProjectSetupAnswers`)

**What happens:**

- Interactive questionnaire using `inquirer.js`
- Collects project configuration preferences
- Validates input (project name format, auth provider choice, etc.)

**Key decisions gathered:**

```typescript
interface ProjectSetupAnswers {
    projectName: string; // Kebab-case project identifier
    description: string; // Human-readable description
    includeWeatherApp: boolean; // Sample app inclusion
    authProvider: 'mock' | 'auth-js' | 'custom' | 'enterprise-sso';
    serviceOrganization: 'monorepo' | 'external';
    awsRegion: string; // Default deployment region
    deploymentStage: string; // Environment stage
    enterpriseFeatures: boolean; // Advanced features toggle
}
```

### Phase 2: Project Structure Creation (`createProjectStructure`)

**Template Processing:**

1. **Source Resolution** - Determines template path (currently uses existing Pika structure)
2. **Variable Context** - Creates mustache template variables from user answers
3. **File Filtering** - Excludes unwanted files (node_modules, .git, weather app if not selected)
4. **Template Transformation** - Processes files through mustache templating and custom transforms

**Custom Transformations:**

- `package.json` - Updates name, description, conditional dependencies
- `.env.example` - Adds auth-provider-specific environment variables
- `README.md` - Personalizes with project details
- Conditional blocks - `{{#if condition}}` and `{{#unless condition}}` processing

**Directory Creation:**

```
Output Project/
├── apps/pika-chat/src/auth/providers/     # Auth provider implementations
├── apps/pika-chat/.../custom-markdown-tag-components/  # Component area
├── services/custom/                       # User service area (if monorepo)
├── pika.config.json                      # Project configuration
└── .pika-sync.json                       # Framework sync metadata
```

### Phase 3: Authentication System Setup (`setupAuthentication`)

**Provider-Specific Generation:**

**Mock Provider:**

- Creates simple mock user object
- Always authenticated for development

**Auth.js Provider:**

- Generates OAuth provider configuration
- Creates session management stubs
- Adds dependency requirements

**Custom Provider:**

- Creates skeleton with required interface methods
- Provides TODO comments for implementation
- Includes token validation patterns

**Enterprise SSO:**

- SAML/OIDC configuration templates
- Environment variable requirements
- Session management for enterprise systems

**File Structure Created:**

```
apps/pika-chat/src/auth/
├── types.ts                    # Core auth interfaces
├── providers/
│   ├── mock-auth.ts           # Development auth
│   ├── custom-auth.ts         # User implementation area
│   └── [selected-provider].ts # Generated provider
└── [config files]             # Provider-specific configs
```

### Phase 4: Custom Components Scaffolding (`createCustomDirectories`)

**Component System Setup:**

1. **Registry Creation** - `custom-markdown-tag-components/index.ts` with auto-discovery
2. **Example Component** - Basic Svelte component demonstrating structure
3. **Type Definitions** - TypeScript interfaces for component props

**Registry Pattern:**

```typescript
// Auto-generated component registry
export const customComponents = {
    example: ExampleComponent
    // User components auto-registered here
};
```

### Phase 5: Configuration Generation (`generateConfigFiles`)

**Project Configuration (`pika.config.json`):**

```typescript
{
  projectName: string,
  framework: { version, lastSync },
  auth: { provider, options },           // User auth choices
  components: { customDirectory, autoDiscovery },
  services: { organization, customDirectory },
  deployment: { region, stage },
  features: { sampleWeatherApp, enterpriseFeatures }
}
```

**Sync Configuration (`.pika-sync.json`):**

```typescript
{
  version: string,
  lastSync: timestamp,
  syncHistory: Array<{ version, timestamp, changes }>,
  protectedPaths: string[],              // Never overwritten by sync
  customPaths: string[]                  // User customization areas
}
```

### Phase 6: Finalization

1. **Dependency Installation** - Package manager detection and execution
2. **Git Initialization** - Repository setup and initial commit
3. **Success Messaging** - Next steps and usage instructions

## 🔄 Sync System Architecture

### Sync Safety Philosophy

**Protected vs Framework Areas:**

- **Protected:** User customization areas (auth providers, custom components, services)
- **Framework:** Core Pika files that receive updates
- **Strategy:** Never overwrite protected areas, only update framework files

### Sync Process Flow

1. **Version Detection** - Compare current vs available versions
2. **Change Analysis** - Identify which framework files need updates
3. **Conflict Detection** - Check if user modifications would be affected
4. **Safe Application** - Update only framework areas
5. **History Tracking** - Record what changed for rollback capability

**File Classification:**

```typescript
// These paths are NEVER modified by sync
protectedPaths: ['apps/pika-chat/src/auth/providers/custom-auth.ts', 'custom-markdown-tag-components/', 'services/custom/', '.env*', 'pika.config.json'];
```

## 🎨 Component Management System

### Component Lifecycle

1. **Creation** (`pika component add`)

    - Interactive prop definition
    - Svelte component generation with TypeScript
    - Automatic registry update

2. **Discovery** (Auto-registration)

    - File system scanning
    - Import generation
    - Type-safe component map updates

3. **Validation** (`pika component validate`)
    - Component syntax checking
    - Registry consistency verification
    - Prop type validation

### Component Architecture

**Generated Component Structure:**

```svelte
<script lang="ts">
  export let propName: PropType = defaultValue;
</script>

<div class="component-name">
  <!-- Generated template based on props -->
</div>

<style>
  /* Component-specific styles */
</style>
```

**Registry Integration:**

- Components automatically imported and exported
- Type-safe component map for LLM usage
- Hot-reload support during development

## 🔐 Authentication System Architecture

### Pluggable Provider Pattern

**Core Interface:**

```typescript
interface AuthProvider {
    name: string;
    authenticate(): Promise<PikaUser | null>;
    logout(): Promise<void>;
    getCurrentUser(): Promise<PikaUser | null>;
    isAuthenticated(): Promise<boolean>;
}
```

**Provider Selection Strategy:**

1. **Development** - Mock provider for immediate functionality
2. **OAuth** - Auth.js integration for standard providers
3. **Custom** - Skeleton for existing auth systems
4. **Enterprise** - SAML/OIDC for corporate environments

### Configuration Management

**Provider-Specific Configs:**

- Environment variables automatically templated
- Dependencies installed conditionally
- Configuration files generated per provider type

## 🗂 File Management Strategy

### Template System

**Mustache Variables:**

- Project metadata (name, description)
- User choices (auth, services, features)
- Generated values (timestamps, regions)

**Conditional Content:**

```mustache
{{#if includeWeatherApp}}
  <!-- Weather app specific content -->
{{/if}}

{{#unless enterpriseFeatures}}
  <!-- Standard feature content -->
{{/unless}}
```

### Safe File Operations

**Copy Strategy:**

- Exclude patterns for unwanted files
- Transform pipeline for dynamic content
- Preserve existing files where appropriate

**Template Processing:**

1. File type detection
2. Content transformation
3. Variable substitution
4. Conditional block processing

## 📊 Configuration Management

### Layered Configuration

1. **Defaults** - Sensible framework defaults
2. **User Choices** - Interactive setup responses
3. **Environment** - Runtime environment variables
4. **Overrides** - Project-specific customizations

### Validation Strategy

**Multi-level Validation:**

- Input validation during setup
- Configuration validation on load
- Runtime validation during operations
- Migration validation during sync

## 🔍 System Integration Points

### Package Manager Integration

**Detection Strategy:**

```
1. Check for lock files (pnpm-lock.yaml, yarn.lock, package-lock.json)
2. Test for available package managers
3. Prefer pnpm > yarn > npm
4. Use detected manager for all operations
```

### Git Integration

**Repository Lifecycle:**

- Initialize clean repository
- Stage all generated files
- Create initial commit with descriptive message
- Prepare for future sync operations

### Environment Validation

**System Requirements:**

- Node.js version compatibility
- Package manager availability
- Git installation verification
- Platform-specific optimizations

## 🎯 Key Design Decisions

### Template-First Architecture

- **Why:** Enables customization without framework conflicts
- **How:** Clear separation between framework and user code
- **Benefit:** Safe updates, predictable customization areas

### Interactive Setup

- **Why:** Reduces configuration complexity for users
- **How:** Guided prompts with smart defaults
- **Benefit:** Lower barrier to entry, fewer setup errors

### TypeScript-First Implementation

- **Why:** Type safety, developer experience, maintainability
- **How:** All code including scripts uses TypeScript
- **Benefit:** Fewer runtime errors, better tooling support

### Pluggable Authentication

- **Why:** Different organizations have different auth requirements
- **How:** Provider interface with multiple implementations
- **Benefit:** Flexibility without complexity

## 🚨 Critical Implementation Notes

### Framework Update Safety

- Never modify user customization areas
- Always preserve user configuration
- Provide rollback capability
- Clear conflict resolution

### Component System Isolation

- User components isolated from framework components
- Registry-based discovery prevents conflicts
- Type safety maintained across updates

### Configuration Immutability

- User configuration never overwritten by sync
- Version tracking for all changes
- Migration scripts for breaking changes

---

This architecture prioritizes **user control**, **update safety**, and **developer experience** while maintaining the flexibility needed for diverse deployment scenarios.
