# Documentation Generation Prompt

Use this prompt when you've built or are building a new feature that needs documentation. Copy and paste this into your code assistant, then provide details about the feature.

---

## TASK: Document New Feature for Pika Platform

I've implemented (or am implementing) a new feature that needs documentation. Please help me create comprehensive, well-structured documentation following the Pika documentation philosophy and standards.

### Step 1: Understand the Feature

**Feature Information Needed:**

1. **What is the feature?** (Brief technical description)
2. **What problem does it solve?** (User perspective)
3. **Who is it for?** (Target audience: product managers, engineering managers, developers)
4. **What files/code changed?** (Implementation details)
5. **Are there configuration options?** (Settings, environment variables, etc.)
6. **Are there new APIs or types?** (Endpoints, TypeScript interfaces, etc.)
7. **Are there prerequisites or dependencies?** (What users need before using this)

**Important**: Pika documentation is for **decision-makers and builders** (product managers, engineering managers, developers), NOT end users of chat applications.

Ask me these questions to understand what needs to be documented.

---

### Step 2: Documentation Philosophy - Diátaxis Framework

Pika documentation follows the **Diátaxis framework**, which organizes docs by user intent:

#### 📚 **Tutorials** (Getting Started) - Learning by doing

- **Purpose**: Help beginners achieve something practical
- **Location**: `apps/pika-docs/src/content/docs/getting-started/`
- **Style**: Friendly, step-by-step, hands-on, goal-oriented
- **Example**: "Build your first agent with authentication"
- **When to create**: For foundational learning experiences that get users productive

#### 🔧 **How-To Guides** (Guides) - Solving a specific problem

- **Purpose**: Task-focused recipes for concrete goals
- **Location**: `apps/pika-docs/src/content/docs/guides/`
- **Subdirectories**:
    - `deployment/` - Deploying and running Pika
    - `agent-development/` - Building and configuring agents
    - `authentication/` - Security and access control
    - `customization/` - UI and feature customization
    - `data-sessions/` - User data and session management
    - `intelligence/` - AI quality and reasoning features
    - `admin/` - Administrative operations
    - `advanced/` - Advanced topics and patterns
- **Style**: Direct, assumes prior knowledge, goal-oriented
- **Example**: "How to integrate your SSO provider"
- **When to create**: For specific tasks users need to accomplish

#### 📖 **Explanations** (Concepts) - Understanding the "why"

- **Purpose**: Background, reasoning, design philosophy, mental models
- **Location**: `apps/pika-docs/src/content/docs/concepts/`
- **Subdirectories**:
    - `overview/` - What is Pika, philosophy, when to use
    - `architecture/` - System design, AWS infrastructure, security
    - `key-concepts/` - Fundamental concepts (agents, sessions, memory, MCP)
    - `how-pika-works/` - Internal processes and mechanisms
- **Style**: Explanatory, not prescriptive, focuses on understanding
- **Example**: "Why Pika uses agents-as-configuration"
- **When to create**: To explain design decisions and help users understand the platform

#### 📋 **Reference** (Reference) - Technical truth

- **Purpose**: Precise, complete technical information
- **Location**: `apps/pika-docs/src/content/docs/reference/`
- **Subdirectories**:
    - `configuration/` - Config schemas and options
    - `api/` - REST APIs, endpoints, parameters
    - `types/` - TypeScript interfaces and types
    - `ui-components/` - UI component documentation
    - `cli/` - CLI command reference
- **Style**: Accurate, exhaustive, structured, not explanatory
- **Example**: "AgentConfig interface properties and types"
- **When to create**: For APIs, configuration options, types, commands

#### 🌟 **Capabilities** (Overview/Showcase)

- **Purpose**: Feature showcase and overview
- **Location**: `apps/pika-docs/src/content/docs/capabilities/`
- **Subdirectories**:
    - `core/` - Core platform capabilities
    - `intelligence/` - AI quality and reasoning features
    - `integration/` - Integration options (MCP, inline tools)
    - `customization/` - Customization capabilities
    - `data-memory/` - Data and memory features
    - `enterprise/` - Enterprise features
- **Style**: Marketing-friendly but accurate, highlights value
- **When to create**: To showcase what the platform can do

#### ❓ **Why** (Persuasion/Positioning)

- **Purpose**: Help users understand if Pika solves their problem
- **Location**: `apps/pika-docs/src/content/docs/why/`
- **Style**: Persuasive but honest, comparative, decision-focused
- **When to create**: Rarely - only for positioning and "why choose Pika" content

---

### Step 3: Determine Documentation Scope

**For New Features or Capabilities:**
Create comprehensive documentation across ALL relevant categories:

- Capability overview in `capabilities/` (what it does, why it matters)
- Concept explanation in `concepts/` (how it works, design philosophy)
- How-to guide in `guides/` (step-by-step implementation)
- Reference documentation in `reference/` (API specs, types, configuration)

**For Improvements to Existing Features:**
Update existing documentation where the feature is discussed:

- Find capability/concept/guide docs that mention the feature
- Update with new capabilities, examples, or patterns
- Add notes about improvements or changes

**For Bug Fixes:**
Generally no documentation changes needed unless:

- The bug fix changes expected behavior
- Users need to know about the fix for migration
- The fix enables new use cases

### Step 4: Determine Documentation Placement

Based on the feature information, determine what documentation is needed:

1. **New capability/feature showcase?**
   → Add to `capabilities/` (what it does, why it matters)

2. **Fundamental concept to understand?**
   → Add to `concepts/` (explain how it works, why it exists)

3. **Step-by-step task to accomplish?**
   → Add to `guides/` in appropriate subdirectory (how to use it)

4. **Tutorial for learning?**
   → Add to `getting-started/` if foundational, or create tutorial

5. **API, config, types, or CLI reference?**
   → Add to `reference/` in appropriate subdirectory (technical specs)

**Most features need multiple docs**:

- Capability overview in `capabilities/`
- Concept explanation in `concepts/`
- How-to guide in `guides/`
- Reference documentation in `reference/`

---

### Step 5: Markdoc Syntax and Components

**CRITICAL**: All Pika documentation uses **Markdoc only** (not MDX). Follow these rules:

#### Required Syntax Reference

See `apps/pika-docs/src/content/docs/doc-instructions/overview.mdoc` for complete syntax reference. Key points:

**Frontmatter** (required):

```markdown
---
title: Feature Name
description: Brief description for SEO and navigation
---
```

**Components to Use**:

- `{% aside type="note/tip/caution/danger" %}` - Callouts and warnings
- `{% card title="Title" icon="icon-name" %}` - Feature cards
- `{% fancyCard title="Title" bgColor="#hex" %}` - Styled feature cards
- `{% tabs %}` + `{% tabitem label="Label" %}` - Alternative approaches
- `{% collapsible title="Title" %}` - Optional/advanced content
- `{% steps %}` - Numbered procedures
- `{% code lang="ts" code="..." meta="..." /%}` - Advanced code features
- `:badge[Text]{variant="tip"}` - Inline status badges

**Diagrams**:

- For complex concepts, create Draw.io SVG diagrams
- Follow instructions in `apps/pika-docs/src/content/docs/doc-instructions/drawio-svg-instructions.mdoc`
- Save to `apps/pika-docs/public/img/diagrams/`
- Name with `.drawio.svg` extension
- Reference as `![Description](/img/diagrams/filename.drawio.svg)`
- Images are automatically zoomable in docs

**Code Blocks**:

- Use language-specific fences: \`\`\`typescript, \`\`\`bash, \`\`\`javascript
- Add titles: \`\`\`typescript title="filename.ts"
- For advanced features (line numbers, highlighting), use `{% code %}` component

**Common Mistakes to Avoid**:

- ❌ Using `{% callout %}` (does not exist - use `{% aside %}`)
- ❌ Using `type="warning"` (invalid - use `type="caution"`)
- ❌ Using emojis in documentation (remove if found)
- ❌ Using MDX syntax (only Markdoc is supported)

---

### Step 6: Update Navigation in sidebar-config.ts

**CRITICAL**: Every new documentation file must be added to the navigation.

**Location**: `apps/pika-docs/sidebar-config.ts`
**Section**: Inside `sidebarTopics` array

**Navigation Structure**

```javascript
{
  label: 'Section Name',
  link: '/section/',
  id: 'section',
  icon: 'icon-name',
  items: [
    { label: 'Overview', slug: 'section' },
    { label: 'Page Title', slug: 'section/page-name' },
    {
      label: 'Subsection',
      collapsed: true, // or false for expanded by default
      items: [
        { label: 'Nested Page', slug: 'section/subsection/page' }
      ]
    }
  ]
}
```

**Rules**:

1. Match the `slug` to the file path (without `.mdoc` extension)
2. The `slug` for `index.mdoc` is just the directory name (e.g., `guides` not `guides/index`)
3. Add pages in logical order within their section
4. Use `collapsed: true` for subsections to reduce visual clutter
5. Use `collapsed: false` for important subsections that should default open

**Example**: Adding a new guide at `apps/pika-docs/src/content/docs/guides/authentication/sso-setup.mdoc`:

```javascript
{
  label: 'Authentication & Access',
  collapsed: true,
  items: [
    { label: 'Integrate Your Authentication System', slug: 'guides/authentication/integrate-auth' },
    { label: 'Set Up SSO', slug: 'guides/authentication/sso-setup' }, // NEW
    { label: 'Configure Chat App Access Control', slug: 'guides/authentication/access-control' },
    { label: 'Set Up User-to-Organization Mapping', slug: 'guides/authentication/user-org-mapping' }
  ]
}
```

---

### Step 7: Documentation Quality Standards

**Writing Style**:

- User-focused: Explain impact, not just implementation
- Clear and concise: One concept per section
- Action-oriented: Use active voice ("Configure the agent" not "The agent is configured")
- Consistent terminology: Use platform terms consistently
- Professional tone: No marketing hype, honest about limitations

**Structure**:

- Start with overview/context
- Provide clear prerequisites
- Use headings to create scannable structure
- Include code examples that are complete and tested
- Add troubleshooting sections for common issues
- Link to related docs

**Code Examples**:

- Complete and runnable (include imports)
- Commented to explain non-obvious logic
- Follow TypeScript/JavaScript best practices
- Include error handling where appropriate
- Show realistic use cases

**Cross-References**:

- Link to related concepts
- Reference prerequisite docs
- Point to detailed reference documentation
- Suggest "next steps" at the end
- Use `https://github.com/rithum/pika/` for GitHub repository links

---

### Step 8: Generate the Documentation

Based on the feature information, create the appropriate documentation files:

1. **Create the .mdoc file(s)** in the correct location(s)
    - Include proper frontmatter (title, description)
    - Follow Diátaxis principles for that doc type
    - Use appropriate Markdoc components
    - Add diagrams if complex concepts need visualization
    - Include complete code examples

2. **Update astro.config.mjs navigation**
    - Add entries to the appropriate section(s)
    - Place in logical order
    - Use consistent naming

3. **Cross-reference related docs**
    - Link from existing docs to new docs where relevant
    - Update index/overview pages if needed

4. **Verify completeness**
    - All configuration options documented in reference
    - All user-facing features have how-to guides
    - Complex concepts have explanations
    - Breaking changes have migration guides (if applicable)

---

### Step 9: Quality Checklist

Before finalizing, verify:

- [ ] Frontmatter includes title and description
- [ ] Markdoc syntax is valid (no MDX)
- [ ] Code examples are complete and tested
- [ ] Diagrams are in `/img/diagrams/` with `.drawio.svg` extension
- [ ] Navigation updated in `astro.config.mjs`
- [ ] Cross-references to related docs added
- [ ] Writing is user-focused and clear
- [ ] No emojis used
- [ ] Troubleshooting section included (for guides)
- [ ] Prerequisites clearly stated
- [ ] Follows appropriate Diátaxis category style

---

## Action Required

1. **Ask me about the feature** using the questions in Step 1
2. **Determine what documentation is needed** based on Diátaxis framework
3. **Create the documentation files** with proper Markdoc syntax
4. **Update the navigation** in `astro.config.mjs`
5. **Verify quality** using the checklist

Let's build comprehensive, helpful documentation that makes this feature accessible to users!
