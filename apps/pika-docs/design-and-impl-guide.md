## Executive Summary

This document outlines the complete redesign of Pika Platform documentation from a confusing, feature-centric structure to an intuitive, user-goal-oriented architecture. The new design addresses critical issues with the current documentation while supporting a new training course initiative and better communicating Pika's value proposition.

NOTE!!! IMPORTANT!!! Do not use emojis in any documentation or comments you generated. If you find them in existing documentation, remove them.

### Current State Problems

**Feature Section (23 items):**

- Too large and unwieldy
- Mixes "what it is" with "why you'd use it"
- Difficult to navigate
- Doesn't effectively sell the platform

**Developer Guide Section (33 items):**

- Extremely confusing organization
- Mixes tutorials, how-tos, and reference material
- No clear learning path
- Technical details buried with conceptual content

**Home Page:**

- Doesn't clearly communicate platform purpose and value
- Features list is descriptive but not persuasive
- Missing the "why Pika?" narrative

### Technical Changes

We are also migrating from sveltepress using markdown docs to starlight astro using markdoc exclusively.

---

## Technical

### Directory State

The current sveltepress documentation site was housed in `apps/pika-docs` but I moved it to `apps/pika-docs-old`. The new starlight astro markdoc site is now housed in `apps/pika-docs`.

### Files we will need to review and modify for correctness based on the new documentation structure and approach

These docs reference `apps/pika-docs`. Before that was a reference to the sveltepress site. Now it is a reference to the starlight astro markdoc site. We need to review them and make sure that they will all still work and if not make changes accordingly.

For example, the RELEASING.md file mentions that the changelog that accompanies the doc site are located in `apps/pika-docs/src/routes/docs/releases/changelog/+page.md`. When we're done, that path will likely be different. I have added references to the list below for things I found that will need to change but this might not be comprehensive and you should search and make sure.

- RELEASING.md
    - Change `apps/pika-docs/src/routes/docs/releases/changelog/+page.md` to new changelog page in doc site
    - Change `apps/pika-docs/src/routes/docs/releases/migration-guides/` to wherever we now keep migration guides for releases
    - Change `apps/pika-docs/src/routes/docs/releases/migration-guides/<name>/+page.md` to indicate where to put new migration guides
    - Change `apps/pika-docs/vite.config.ts` to indicate where the code assistant should put migration guides so they show up in the left nav
- .github/workflows/gh-pages.yml
    - Change this to be correct for however we are meant to build the new doc site for github pages
- packages/pika-cli/src/commands/create-app.ts
    - It references `'apps/pika-docs'` to not be copied which doesn't need to change
- packages/tools/README.md
    - Will need to change what we say the notes command does since we likely will no longer have a stand alone features set of docs anymore
    - Change this `apps/pika-docs/src/routes/docs/releases/changelog/+page.md` to what it should now be
    - Change this `apps/pika-docs/src/routes/docs/releases/migration-guides/[name]/+page.md` to what it should now be
    - Change this `git diff {{baseBranch}}...HEAD -- apps/pika-docs/src/routes/docs/features/` to what it should now be
- packages/tools/src/release.ts and packages/tools/src/release-prompt.md
    - We will need to change these based on what we need to tell the code assistant to do to help discover changed documentation and generate the correct missing documentation

### State of the new apps/pika-doc starlight astro markdoc project

There is a fledgling project in that directory now, configured how I want it to be.

- apps/pika-docs/public
    - This is where all top level images are placed and images I don't want astro to modify
    - apps/pika-docs/public/img/diagrams
        - This is where the drawio.svg diagrams we create together go more on this later, (as you migrate docs you may need to update paths)
    - apps/pika-docs/public/img/logos
        - This is where we keep our logos (as you migrate docs you may need to update paths)
- apps/pika-docs/src/assets
    - This is where we keep assets we want starlight astro to optimize for us
        - apps/pika-docs/src/assets/screenshots
            - We keep all screenshots we reference in our docs here
        - apps/pika-docs/src/assets/bg-image.jpg
            - We keep this here since our doc instructions reference this in an example (more on doc instructions later)

### Markdoc reference

Please review this markdoc reference that incudes all the components to use in the markdoc files.

`apps/pika-docs/src/content/docs/doc-instructions/overview.mdoc`

### Include Diagrams When Helpful to the Reader

Generate diagrams when explaining agent architectures, agentic workflow sequences, AWS service integrations, or the relationships between Pika's core components (Bedrock, Lambda, DynamoDB, OpenSearch). Create diagrams for chat session flows, agent feedback loops, self-correcting mechanisms, authentication integrations, and deployment topologies across AWS infrastructure. Prioritize diagram creation when discussing agent configuration schemas, multi-agent interactions, user-to-organization relationships, session memory management, or LLM evaluation pipelines. Always offer to create a diagram when explaining complex agent workflows, AWS resource dependencies, chat app architectures, admin site functionality, or when breaking down how agents process requests through Pika's self-correcting feedback system. Visual representations are particularly valuable for deployment scenarios, agent communication patterns, and demonstrating how Pika integrates with existing microservice architectures.

All diagrams should be created following these instructions exactly: `apps/pika-docs/src/content/docs/doc-instructions/drawio-svg-instructions.mdoc` and saved in `apps/pika-docs/public/img/diagrams`.

Diagrams may be referenced like this: `![System Architecture](/img/diagrams/architecture.drawio.svg)`

### Considerations When Converting from Old Markdoc

The old markdoc documentation had a bug where it couldn't render fenced typescript. So, everywhere you see three ticks followed by js it is really meant to be typescript.

Also, be on the lookout for the `<tabs>` components. Those will need to be converted to the tabs supported in the markdoc reference. If you don't feel the tabs add much, feel free to remove them.

### Make good use of advanced code block features

The markdoc reference already mentioned, `apps/pika-docs/src/content/docs/doc-instructions/overview.mdoc`, includes some advanced code component cases that require instead of fenced code blocks the \{ \% style of markdoc to get line nubmers, higlighted lines and to collapse sections that don't add much but it's nice to be there collapsed. Make use of these when needed and when not needed, fallback to just plain fenced code blocks ` ` ` typescript (note the ticks have spaces between them just to not have them parsed here as markdown).

### Site Navigation

Consider that we are making use of the `starlight-sidebar-topics` feature that segragates the left nav into topics at the topic and the user clicks on a topic and then the items for that topic appear.

The nav is configured in `apps/pika-docs/astro.config.mjs` in the starlight.plugins.starlightSidebarTopics array.

Each topic should have a home page that is an `index.mdoc` in the corresponding folder. Here's an example of how it works to reference the index.mdoc page.

```
{
    label: 'Guides',
    link: '/guides/',
    id: 'guides',
    icon: 'open-book',
    items: [
        { label: 'Overview', slug: 'guides' },
        { label: 'Quick Start', slug: 'guides/quick-start' }
    ]
}
```

The first entry is a reference to the home page for guides which is at this path: `apps/pika-docs/src/content/docs/guides/index.mdoc`

## Design Principles

### 1. User-Goal Orientation

Documentation should be organized by **what the user wants to accomplish**, not by internal feature categorization.

### 2. Progressive Disclosure

Information should be revealed progressively:

- Start with high-level value and concepts
- Provide learning paths for different skill levels
- Deep technical details available but not overwhelming

### 3. Persuasion Before Education

Users need to understand **why** before they commit to learning **how**.

### 4. Separation of Concerns

Clear boundaries between:

- **Selling** (capabilities, use cases, value)
- **Learning** (tutorials, training)
- **Doing** (how-to guides, recipes)
- **Understanding** (concepts, architecture)
- **Looking Up** (reference, API docs)

---

## Technology Stack

- **Framework:** Astro with Starlight theme
- **Content Format:** Markdoc
- **Navigation:** Left sidebar with collapsible sections
- **Style Reference:** Aptos Documentation design pattern (see uploaded image)

---

## New Documentation Architecture

Note that we need to keep `apps/pika-docs/src/content/docs/doc-instructions` as a direct child of docs. I won't ever link to them but they are there for me and for you the code assistant to have as a reference. Dont' delete them or move them. They are referenced in `apps/pika-docs/astro.config.mjs` in the exclude section.

### High-Level Navigation Structure

```
📚 Pika Documentation
├── 🎯 Why Pika                    [NEW - Persuasion/Sales]
├── 🚀 Getting Started             [Tutorials - Adapted Diátaxis]
├── 🎓 Training Course             [NEW - Learning Path]
├── 💡 Capabilities                [NEW - Replaces Features]
├── 📘 How-To Guides               [Doing - Adapted Diátaxis]
├── 🧠 Concepts & Architecture     [Understanding - Adapted Diátaxis]
├── 📖 Reference                   [NEW - Technical Lookup]
└── 🔧 Platform Info               [Releases, Contributing, etc.]
```

---

### Tasks

We are going to skip the Training Course for now. Just put a placeholder page there. This is the order of the tasks we are going to do. I will tell you which one of these tasks to do You will do that task, I will go back and forth interactively with you to ensure thet ask is done and then when done you will mark the task done. I will then start a new chat session and ask you to proceed to the next task.

1. Why Pika task - DONE
2. Getting Started task - DONE
3. Capabilities
4. How-To Guides
5. Concepts & Architecture
6. Reference
7. Platform Info

### Items to Come Back To

These items need to be addressed after the main documentation structure is complete:

1. **Comparison Matrix** (`apps/pika-docs/src/content/docs/why/index.mdoc`)
    - Compare Pika with building custom on AWS
    - Compare with LangChain/LlamaIndex + custom UI
    - Compare with commercial agent platforms
    - Compare with other open-source frameworks
    - Comparison dimensions: Time to production, Infrastructure included, UI/UX provided, Security features, Operational tooling, Cost structure, Learning curve, Flexibility vs convenience

## Detailed Section Breakdown

NOTE!!! The following is an excellent guide for you. Don't feel like you have to stick to it exactly. You should be constantly referencing the existing docmentation in `apps/pika-docs-old/src/routes/docs/features` and `apps/pika-docs-old/src/routes/docs/developer` to make sure you are getting all the content correct and complete.

It's super important that these are among the best technical docs out there. This is a very important project that can help a lot of people if they can understand why and how to adopt it.

### 1. 🎯 Why Pika (NEW SECTION)

**Purpose:** Persuade and contextualize before users invest time learning

**User Goal:** Understand if Pika solves their problem and why it's the right choice

**Navigation Position:** Top left - First major section

#### Content Structure:

```
🎯 Why Pika
├── Overview: The AI Integration Challenge
├── Why Not Just Build It Yourself?
├── The Pika Approach
│   ├── AWS Foundation: Scale Without the Complexity
│   ├── Agent-as-Config: Keep Your Codebase Clean
│   ├── Production-Ready from Day One
│   └── From Toy to Tool: The Missing Middle
├── Who Is Pika For?
│   ├── For Product Teams
│   ├── For Engineering Teams
│   └── For Enterprise Organizations
└── Pika vs. Other Solutions
    ├── Comparison Matrix
    └── When to Choose Pika
```

#### Key Messaging (from your input):

**AWS Foundation:**

> "We use AWS - that's foundational. It does all the heavy lifting for us and makes this thing scale to whatever you need."

**The Hard Problems, Solved:**

> "We recognize there are so many ways to create agents, why would you use this approach? We have paid the price to figure out what you actually need to do to bring your business (its data, files, and APIs) into the world of AI. It's not unlike going online with the internet back in the day - it's that fundamental, that hard."

**Beyond the Shiny Demo:**

> "Getting an agent built takes very little time in most modern agentic frameworks. Getting one that can expose your data from a database isn't very hard at all. Your devs will build one, you will look at it and think it's amazing. And it is... until your customers try to use it. Getting from shiny cool thing to actually useful to your customers is very hard."

**UI & Security Included:**

> "Pika allows devs to not have to think about the UI and its security and all the features to make a chat app that is world class. It just comes with it. You plug in your authentication model, you define your chat app as config, your agents as config and your tools."

**Keep Your Codebase Clean:**

> "Pika doesn't force you to code in the Pika codebase. You simply create an instance of Pika, configure auth and the settings you want to turn on and deploy it. Then your devs work within their existing codebases to deploy config that defines their agents/chat apps."

**Production Intelligence:**

> "Pika has built into it tools and capabilities to help you go from toy to reliable product... everything from feedback and analytics that are auto-generated by AI based on the chat sessions your customers make to giving you rapid iteration cycles on adding the missing context necessary to answer all the edge cases."

**Internal & External Use Cases:**

> "We know you will likely have internally focused (your own employees) and externally focused (your customers) chat apps and agents. The platform supports this out of the box, with full control about who gets to see which chat apps with fine-grained controls."

---

### 2. 🚀 Getting Started

**Purpose:** Get users to their first success as quickly as possible

**User Goal:** "I want to see Pika work in 15 minutes"

**Adapted from Diátaxis:** Tutorials section

#### Content Structure:

🚀 Getting Started
├── Quickstart (15-Minute Path)
│ ├── Prerequisites
│ ├── InstallationRetryBGPut it in an artifact as a complete markdown doc so I can copy paste itAssembled complete design document for artifact export.The user wants me to put the complete design document in an artifact so they can easily copy and paste it. I should create a markdown artifact with all the content from the design document I created earlier. Let me compile the full document.I'll create the complete design document as a markdown artifact for you:
md# Pika Documentation Redesign - Design & Implementation Guide

**Version:** 1.0  
**Date:** October 24, 2025  
**Status:** Draft

---

## Executive Summary

This document outlines the complete redesign of Pika Platform documentation from a confusing, feature-centric structure to an intuitive, user-goal-oriented architecture. The new design addresses critical issues with the current documentation while supporting a new training course initiative and better communicating Pika's value proposition.

### Current State Problems

**Feature Section (23 items):**

- Too large and unwieldy
- Mixes "what it is" with "why you'd use it"
- Difficult to navigate
- Doesn't effectively sell the platform

**Developer Guide Section (33 items):**

- Extremely confusing organization
- Mixes tutorials, how-tos, and reference material
- No clear learning path
- Technical details buried with conceptual content

**Home Page:**

- Doesn't clearly communicate platform purpose and value
- Features list is descriptive but not persuasive
- Missing the "why Pika?" narrative

---

## Design Principles

### 1. User-Goal Orientation

Documentation should be organized by **what the user wants to accomplish**, not by internal feature categorization.

### 2. Progressive Disclosure

Information should be revealed progressively:

- Start with high-level value and concepts
- Provide learning paths for different skill levels
- Deep technical details available but not overwhelming

### 3. Persuasion Before Education

Users need to understand **why** before they commit to learning **how**.

### 4. Separation of Concerns

Clear boundaries between:

- **Selling** (capabilities, use cases, value)
- **Learning** (tutorials, training)
- **Doing** (how-to guides, recipes)
- **Understanding** (concepts, architecture)
- **Looking Up** (reference, API docs)

---

## Technology Stack

- **Framework:** Astro with Starlight theme
- **Content Format:** Markdoc
- **Navigation:** Left sidebar with collapsible sections
- **Style Reference:** Aptos Documentation design pattern (see uploaded image)

---

## New Documentation Architecture

### High-Level Navigation Structure

```
📚 Pika Documentation
├── 🎯 Why Pika                    [NEW - Persuasion/Sales]
├── 🚀 Getting Started             [Tutorials - Adapted Diátaxis]
├── 🎓 Training Course             [NEW - Learning Path]
├── 💡 Capabilities                [NEW - Replaces Features]
├── 📘 How-To Guides               [Doing - Adapted Diátaxis]
├── 🧠 Concepts & Architecture     [Understanding - Adapted Diátaxis]
├── 📖 Reference                   [NEW - Technical Lookup]
└── 🔧 Platform Info               [Releases, Contributing, etc.]
```

---

## Detailed Section Breakdown

### 1. 🎯 Why Pika (NEW SECTION)

**Purpose:** Persuade and contextualize before users invest time learning

**User Goal:** Understand if Pika solves their problem and why it's the right choice

**Navigation Position:** Top left - First major section

#### Content Structure:

```
🎯 Why Pika
├── Overview: The AI Integration Challenge
├── Why Not Just Build It Yourself?
├── The Pika Approach
│   ├── AWS Foundation: Scale Without the Complexity
│   ├── Agent-as-Config: Keep Your Codebase Clean
│   ├── Production-Ready from Day One
│   └── From Toy to Tool: The Missing Middle
├── Who Is Pika For?
│   ├── For Product Teams
│   ├── For Engineering Teams
│   └── For Enterprise Organizations
└── Pika vs. Other Solutions
    ├── Comparison Matrix
    └── When to Choose Pika
```

#### Key Messaging (from your input):

**AWS Foundation:**

> "We use AWS - that's foundational. It does all the heavy lifting for us and makes this thing scale to whatever you need."

**The Hard Problems, Solved:**

> "We recognize there are so many ways to create agents, why would you use this approach? We have paid the price to figure out what you actually need to do to bring your business (its data, files, and APIs) into the world of AI. It's not unlike going online with the internet back in the day - it's that fundamental, that hard."

**Beyond the Shiny Demo:**

> "Getting an agent built takes very little time in most modern agentic frameworks. Getting one that can expose your data from a database isn't very hard at all. Your devs will build one, you will look at it and think it's amazing. And it is... until your customers try to use it. Getting from shiny cool thing to actually useful to your customers is very hard."

**UI & Security Included:**

> "Pika allows devs to not have to think about the UI and its security and all the features to make a chat app that is world class. It just comes with it. You plug in your authentication model, you define your chat app as config, your agents as config and your tools."

**Keep Your Codebase Clean:**

> "Pika doesn't force you to code in the Pika codebase. You simply create an instance of Pika, configure auth and the settings you want to turn on and deploy it. Then your devs work within their existing codebases to deploy config that defines their agents/chat apps."

**Production Intelligence:**

> "Pika has built into it tools and capabilities to help you go from toy to reliable product... everything from feedback and analytics that are auto-generated by AI based on the chat sessions your customers make to giving you rapid iteration cycles on adding the missing context necessary to answer all the edge cases."

**Internal & External Use Cases:**

> "We know you will likely have internally focused (your own employees) and externally focused (your customers) chat apps and agents. The platform supports this out of the box, with full control about who gets to see which chat apps with fine-grained controls."

---

### 2. 🚀 Getting Started

**Purpose:** Get users to their first success as quickly as possible

**User Goal:** "I want to see Pika work in 15 minutes"

**Adapted from Diátaxis:** Tutorials section

#### Content Structure:

```
🚀 Getting Started
├── Quickstart (15-Minute Path)
│   ├── Prerequisites
│   ├── Installation
│   └── Your First Chat App
├── Installation Guide
│   ├── System Requirements
│   ├── AWS Setup
│   └── Local Setup
├── Hello World Tutorial
│   ├── Create Your First Agent
│   ├── Deploy to Local
│   └── Test Your Chat App
└── Next Steps
    ├── Explore Capabilities
    ├── Take the Training Course
    └── Join the Community
```

**Current Content Mapping:**

- `/docs/developer/installation/` → Move here
- `/docs/developer/getting-started/` → Merge into Quickstart
- `/docs/developer/local-development/` → Move relevant parts here

---

### 3. 🎓 Training Course (NEW SECTION)

**Purpose:** Structured learning path with video + written content

**User Goal:** "I want to learn Pika systematically"

#### Content Structure:

```
🎓 Training Course
├── Course Overview
├── Module 1: Foundations
│   ├── Lesson 1: Understanding Pika Architecture (Video + Text)
│   ├── Lesson 2: Setting Up Your Environment (Video + Text)
│   └── Lesson 3: Your First Agent (Video + Text)
├── Module 2: Core Concepts
│   ├── Lesson 4: Agents as Config (Video + Text)
│   ├── Lesson 5: Session Management (Video + Text)
│   └── Lesson 6: User Memory (Video + Text)
├── Module 3: Tools & Integration
│   ├── Lesson 7: Inline Tools (Video + Text)
│   ├── Lesson 8: MCP Integration (Video + Text)
│   └── Lesson 9: Multi-Agent Collaboration (Video + Text)
├── Module 4: Production Deployment
│   ├── Lesson 10: Authentication & Access Control (Video + Text)
│   ├── Lesson 11: Deploying to AWS (Video + Text)
│   └── Lesson 12: Monitoring & Analytics (Video + Text)
└── Module 5: Advanced Topics
    ├── Lesson 13: Custom Web Components (Video + Text)
    ├── Lesson 14: Instruction Engineering (Video + Text)
    └── Lesson 15: Enterprise Patterns (Video + Text)
```

**Implementation Notes:**

- Each lesson has embedded video with transcript
- Written content provides code snippets and step-by-step instructions
- Progress tracking (if platform supports)
- Estimated time for each module

---

### 4. 💡 Capabilities (REPLACES FEATURES)

**Purpose:** Show what Pika can do in a scannable, benefit-focused way

**User Goal:** "What can I build with this?" and "What features should I turn on?"

**Why "Capabilities" instead of "Features":**

- Features = technical list
- Capabilities = what you can accomplish

#### Content Structure:

```
💡 Capabilities
├── Overview: What You Can Build
├── 🎯 Core Platform Capabilities
│   ├── Advanced Chat Applications
│   │   └── What it enables, Use cases, Quick facts
│   ├── Multi-Agent Orchestration
│   │   └── What it enables, Use cases, Quick facts
│   ├── Agent-as-Configuration
│   │   └── What it enables, Use cases, Quick facts
│   └── Production-Grade Security
│       └── What it enables, Use cases, Quick facts
│
├── 🧠 Intelligence Capabilities
│   ├── Self-Correcting Responses
│   ├── Answer Reasoning & Verification
│   ├── LLM-Generated Feedback
│   └── AI-Driven Insights & Analytics
│
├── 🔌 Integration Capabilities
│   ├── Model Context Protocol (MCP)
│   ├── Inline Tools
│   ├── Direct Agent Invocation
│   └── Custom Web Components
│
├── 🎨 Customization Capabilities
│   ├── UI Customization
│   ├── Authentication Integration
│   ├── Multi-Context Widget System
│   └── Instruction Engineering
│       ├── Instruction Assistance
│       └── Instruction Augmentation
│
├── 💾 Data & Memory Capabilities
│   ├── User Memory
│   ├── Session Management
│   └── Entity Management
│
└── 👥 Enterprise Capabilities
    ├── Admin Site & Management
    ├── Access Control & Permissions
    ├── Multi-Tenancy Support
    └── Compliance & Data Protection
```

**Content Template for Each Capability:**

```markdown
## [Capability Name]

### What It Does

[1-2 sentence description]

### Why It Matters

[Business value, problem it solves]

### Use Cases

- [Specific use case 1]
- [Specific use case 2]
- [Specific use case 3]

### Key Features

- [Feature bullet 1]
- [Feature bullet 2]

### Getting Started

→ [Link to How-To Guide]
→ [Link to Training Module]
→ [Link to Reference Docs]

### Related Capabilities

- [Link to related capability 1]
- [Link to related capability 2]
```

**Current Content Mapping:**

- Current `/docs/features/*` pages → Reorganize into capability categories
- Keep content high-level and benefit-focused
- Technical details move to Reference section

---

### 5. 📘 How-To Guides

**Purpose:** Task-focused instructions for accomplishing specific goals

**User Goal:** "I want to solve this specific problem"

**Adapted from Diátaxis:** How-To Guides section

#### Content Structure:

```
📘 How-To Guides
├── 🚀 Deployment
│   ├── Deploy to AWS with CDK
│   ├── Deploy Using Serverless Framework
│   ├── Set Up Local Development Environment
│   └── Configure CI/CD Pipelines
│
├── 🤖 Agent Development
│   ├── Define Agents Using Agents-as-Config
│   ├── Enable Multi-Agent Collaboration
│   ├── Implement Tool Use with Inline Tools
│   ├── Integrate External APIs
│   └── Use Model Context Protocol (MCP)
│
├── 🔐 Authentication & Access
│   ├── Integrate Your Authentication System
│   ├── Configure Chat App Access Control
│   ├── Set Up User-to-Organization Mapping
│   └── Manage Permissions and Roles
│
├── 🎨 Customization
│   ├── Customize the UI with Web Components
│   ├── Build Custom Web Components
│   ├── Deploy Custom Web Components
│   ├── Override Default Features
│   └── Extend User Data Models
│
├── 💾 Data & Sessions
│   ├── Configure User Memory
│   ├── Manage User Sessions
│   ├── Work with Entities
│   └── Use Custom Message Tags
│
├── 🧠 Intelligence Features
│   ├── Enable Self-Correcting Responses
│   ├── Configure Answer Verification
│   ├── Set Up LLM Feedback Generation
│   ├── Use Instruction Assistance
│   └── Implement Instruction Augmentation
│
├── 📊 Admin & Operations
│   ├── Set Up the Admin Site
│   ├── Configure Site Administration
│   ├── Manage Content
│   ├── Use Stack Management
│   └── Monitor with Traces
│
└── 🔧 Advanced Topics
    ├── Direct Agent Invocation
    ├── Custom Widget Tag Definitions
    ├── Work with Pika UX Module
    └── Configure Sync System
```

**Content Template:**

````markdown
# How to [Accomplish Specific Task]

## What You'll Build/Achieve

[Brief description of end result]

## Prerequisites

- [Requirement 1]
- [Requirement 2]

## Steps

### 1. [First Action]

[Clear instructions]
```code example`

### 2. [Second Action]

[Clear instructions]
``code example`

### 3. [Final Step]

[Clear instructions]
`code example`

## Testing

[How to verify it works]

## Troubleshooting

[Common issues and solutions]

## Next Steps

- [Related how-to]
- [Related capability]

## Related Documentation

- [Concept doc]
- [Reference doc]

```

**Current Content Mapping:**
- Most of current `/docs/developer/*` → Transform into task-focused how-tos
- Remove conceptual explanations (move to Concepts)
- Remove reference material (move to Reference)

---

### 6. 🧠 Concepts & Architecture

**Purpose:** Build mental models and understanding of "why" and "how things work"

**User Goal:** "I want to understand how this works" and "I need to make informed decisions"

**Adapted from Diátaxis:** Explanation section

#### Content Structure:
```

🧠 Concepts & Architecture
├── 📋 Platform Overview
│ ├── What is Pika?
│ ├── Core Philosophy
│ └── When to Use Pika
│
├── 🏗️ Architecture
│ ├── System Architecture Overview
│ ├── AWS Infrastructure Design
│ │ ├── Bedrock Integration
│ │ ├── Lambda Functions
│ │ ├── DynamoDB Structure
│ │ └── OpenSearch Usage
│ ├── Frontend Architecture
│ ├── Security Architecture
│ └── Scalability Model
│
├── 💡 Key Concepts
│ ├── Agents as Configuration
│ │ ├── Why Config-Based?
│ │ ├── Benefits & Trade-offs
│ │ └── Design Patterns
│ ├── Session Management
│ │ ├── How Sessions Work
│ │ ├── State Management
│ │ └── Session Lifecycle
│ ├── User Memory System
│ │ ├── Memory Architecture
│ │ ├── Persistence Strategy
│ │ └── Privacy Considerations
│ ├── Model Context Protocol (MCP)
│ │ ├── MCP Deep Dive
│ │ ├── Why MCP Matters
│ │ └── Integration Patterns
│ └── Self-Correcting Loop
│ ├── How It Works
│ ├── Response Verification
│ └── Feedback Integration
│
├── 🔄 How Pika Works
│ ├── Request Lifecycle
│ ├── Agent Execution Flow
│ ├── Tool Invocation Process
│ ├── Web Component Rendering
│ └── Sync System Mechanics
│
├── 🎯 Design Rationale
│ ├── Why AWS?
│ ├── Why Serverless?
│ ├── Why Config-Based Agents?
│ ├── Why Self-Correcting?
│ └── Trade-offs We Made
│
└── 🔒 Security & Compliance
├── Security Model
├── Data Protection
├── Compliance Considerations
└── Best Practices

```

**Content Style:**
- Narrative and explanatory
- Diagrams and visualizations
- "Why" before "What"
- Links to related how-tos and reference docs

**Current Content Mapping:**
- `/docs/features/key-concepts/` → Expand and reorganize here
- Conceptual content from developer guide → Move here
- `/docs/features/built-on-aws/` → Expand into architecture section

---

### 7. 📖 Reference

**Purpose:** Quick lookup of technical details, APIs, schemas

**User Goal:** "I need to look up syntax/parameters/configuration options"

**Adapted from Diátaxis:** Reference section

#### Content Structure:
```
````

📖 Reference
├── 🔧 Configuration
│ ├── Agent Configuration Schema
│ │ ├── Required Fields
│ │ ├── Optional Fields
│ │ └── Examples
│ ├── Chat App Configuration Schema
│ ├── Platform Settings Reference
│ ├── Feature Flags Reference
│ └── Environment Variables
│
├── 📚 API Reference
│ ├── REST API
│ │ ├── Endpoints
│ │ ├── Authentication
│ │ └── Response Formats
│ ├── Pika UX Module API
│ └── Web Component API
│
├── 🛠️ CLI Reference
│ ├── Commands Overview
│ ├── Command Reference (A-Z)
│ └── CLI Configuration
│
├── 📝 Shared Types & Interfaces
│ ├── TypeScript Types
│ ├── Agent Types
│ ├── User Types
│ ├── Session Types
│ └── Tool Types
│
├── 🎨 UI Components Reference
│ ├── Built-in Web Components
│ ├── Widget System Reference
│ ├── Custom Component Interface
│ └── Styling & Theming
│
└── 📊 Data Models
├── User Data Model
├── Session Data Model
├── Agent Data Model
└── Message Data Model

```

**Content Style:**
- Terse and technical
- Tables and lists
- Searchable
- Minimal prose

**Current Content Mapping:**
- `/docs/developer/api-reference/` → Expand and organize here
- `/docs/developer/shared-types/` → Move here
- Technical details from developer guide → Move here
- Configuration examples from various pages → Consolidate here

---

### 8. 🔧 Platform Info

**Purpose:** Project information, releases, community

**User Goal:** "I need version information / want to contribute / have problems"

#### Content Structure:
```

🔧 Platform Info
├── 📦 Releases
│ ├── Latest Release
│ ├── Changelog
│ └── Migration Guides
│ └── Upgrading to [Version]
│
├── 🤝 Contributing
│ ├── Contribution Guide
│ ├── Development Setup
│ ├── Code Standards
│ └── Pull Request Process
│
├── ❓ Troubleshooting & FAQ
│ ├── Common Issues
│ ├── Error Messages
│ ├── Performance Tuning
│ └── FAQ
│
└── 🌐 Community & Support
├── Getting Help
├── GitHub Discussions
├── Issue Tracker
└── Community Projects
Current Content Mapping:

/docs/releases/\* → Move here unchanged
/docs/developer/troubleshooting/ → Expand and move here
Add new Contributing and Community sections

Home Page Redesign
New Home Page Structure
markdown# Pika Platform

## Intelligence Strikes Fast

[Hero Image/Animation]

### The Gap Between Demo and Production

Building an AI agent is easy. Building one your customers can actually use is hard.

Pika bridges that gap.

[CTA: Get Started in 15 Minutes] [CTA: Watch Demo] [CTA: Read Why Pika]

---

## What Makes Pika Different

### Built on AWS, Built to Scale

AWS does the heavy lifting with Bedrock, Lambda, DynamoDB, and OpenSearch.
You get enterprise-scale infrastructure without the complexity.
[Learn More →]

### Keep Your Codebase Clean

Define agents as configuration. Deploy from your existing microservices.
No need to code in our codebase.
[Learn More →]

### Production-Ready from Day One

Authentication, security, UI, session management, analytics - all included.
Focus on your agent's intelligence, not infrastructure.
[Learn More →]

### From Toy to Tool

Built-in capabilities to transform shiny demos into reliable products:

- Self-correcting response loops
- AI-generated feedback and analytics
- Rapid iteration on edge cases
- Instruction engineering tools
  [Learn More →]

---

## For Every Audience

### Internal Tools

Build AI assistants for your employees. Full access control.

### Customer-Facing Apps

Deploy chat apps for your customers. Fine-grained permissions.

### Both

One platform handles both use cases seamlessly.

---

## Key Capabilities at a Glance

[Grid of capability cards - each with icon, title, 1-sentence description, and Learn More link]

- Advanced Chat Applications
- Multi-Agent Orchestration
- Self-Correcting Intelligence
- Production Analytics
- Enterprise Security
- Custom Integrations
- [6 more...]

[CTA: Explore All Capabilities →]

---

## Get Started

### 1. Quick Start (15 min)

Install Pika and deploy your first agent
[Start Tutorial →]

### 2. Take the Course

Comprehensive training with video lessons
[Start Learning →]

### 3. Read the Docs

Deep dive into concepts and capabilities
[Browse Docs →]

---

## Built by Developers, For Developers

[Testimonials or case studies if available]

---

## Join the Community

GitHub • Discussions • Support

[Footer with links to all major sections]

Navigation Implementation
Left Sidebar Structure (Starlight/Markdoc)
javascript// starlight.config.mjs (or equivalent)
export default {
title: 'Pika Platform',
sidebar: [
{
label: '🎯 Why Pika',
items: [
{ label: 'Overview: The AI Integration Challenge', link: '/why/overview/' },
{ label: 'Why Not Build It Yourself?', link: '/why/why-not-build/' },
{
label: 'The Pika Approach',
collapsed: false,
items: [
{ label: 'AWS Foundation', link: '/why/approach/aws/' },
{ label: 'Agent-as-Config', link: '/why/approach/config/' },
{ label: 'Production-Ready', link: '/why/approach/production/' },
{ label: 'From Toy to Tool', link: '/why/approach/toy-to-tool/' },
]
},
{
label: 'Who Is Pika For?',
collapsed: true,
items: [
{ label: 'For Product Teams', link: '/why/audience/product/' },
{ label: 'For Engineering Teams', link: '/why/audience/engineering/' },
{ label: 'For Enterprises', link: '/why/audience/enterprise/' },
]
},
{ label: 'Pika vs. Other Solutions', link: '/why/comparison/' },
]
},

    {
      label: '🚀 Getting Started',
      items: [
        { label: 'Quickstart (15 Minutes)', link: '/getting-started/quickstart/' },
        { label: 'Installation Guide', link: '/getting-started/installation/' },
        { label: 'Hello World Tutorial', link: '/getting-started/hello-world/' },
        { label: 'Next Steps', link: '/getting-started/next-steps/' },
      ]
    },

    {
      label: '🎓 Training Course',
      collapsed: true,
      items: [
        { label: 'Course Overview', link: '/training/overview/' },
        {
          label: 'Module 1: Foundations',
          collapsed: true,
          items: [
            { label: 'Lesson 1: Pika Architecture', link: '/training/module-1/lesson-1/' },
            { label: 'Lesson 2: Environment Setup', link: '/training/module-1/lesson-2/' },
            { label: 'Lesson 3: Your First Agent', link: '/training/module-1/lesson-3/' },
          ]
        },
        {
          label: 'Module 2: Core Concepts',
          collapsed: true,
          items: [
            { label: 'Lesson 4: Agents as Config', link: '/training/module-2/lesson-4/' },
            { label: 'Lesson 5: Session Management', link: '/training/module-2/lesson-5/' },
            { label: 'Lesson 6: User Memory', link: '/training/module-2/lesson-6/' },
          ]
        },
        // ... more modules
      ]
    },

    {
      label: '💡 Capabilities',
      collapsed: false,
      items: [
        { label: 'Overview', link: '/capabilities/overview/' },
        {
          label: 'Core Platform',
          collapsed: true,
          items: [
            { label: 'Advanced Chat Applications', link: '/capabilities/core/chat-apps/' },
            { label: 'Multi-Agent Orchestration', link: '/capabilities/core/multi-agent/' },
            { label: 'Agent-as-Configuration', link: '/capabilities/core/agents-as-config/' },
            { label: 'Production-Grade Security', link: '/capabilities/core/security/' },
          ]
        },
        {
          label: 'Intelligence',
          collapsed: true,
          items: [
            { label: 'Self-Correcting Responses', link: '/capabilities/intelligence/self-correcting/' },
            { label: 'Answer Reasoning', link: '/capabilities/intelligence/reasoning/' },
            { label: 'LLM-Generated Feedback', link: '/capabilities/intelligence/feedback/' },
            { label: 'AI-Driven Insights', link: '/capabilities/intelligence/insights/' },
          ]
        },
        // ... more capability categories
      ]
    },

    {
      label: '📘 How-To Guides',
      collapsed: true,
      items: [
        {
          label: 'Deployment',
          collapsed: true,
          items: [
            { label: 'Deploy to AWS with CDK', link: '/how-to/deployment/aws-cdk/' },
            { label: 'Deploy with Serverless', link: '/how-to/deployment/serverless/' },
            { label: 'Local Development', link: '/how-to/deployment/local/' },
          ]
        },
        {
          label: 'Agent Development',
          collapsed: true,
          items: [
            { label: 'Define Agents as Config', link: '/how-to/agents/define-config/' },
            { label: 'Multi-Agent Collaboration', link: '/how-to/agents/multi-agent/' },
            { label: 'Implement Inline Tools', link: '/how-to/agents/inline-tools/' },
            // ... more
          ]
        },
        // ... more how-to categories
      ]
    },

    {
      label: '🧠 Concepts & Architecture',
      collapsed: true,
      items: [
        {
          label: 'Platform Overview',
          collapsed: false,
          items: [
            { label: 'What is Pika?', link: '/concepts/overview/what-is-pika/' },
            { label: 'Core Philosophy', link: '/concepts/overview/philosophy/' },
            { label: 'When to Use Pika', link: '/concepts/overview/when-to-use/' },
          ]
        },
        {
          label: 'Architecture',
          collapsed: true,
          items: [
            { label: 'System Architecture', link: '/concepts/architecture/system/' },
            { label: 'AWS Infrastructure', link: '/concepts/architecture/aws/' },
            { label: 'Security Architecture', link: '/concepts/architecture/security/' },
          ]
        },
        // ... more concept categories
      ]
    },

    {
      label: '📖 Reference',
      collapsed: true,
      items: [
        {
          label: 'Configuration',
          collapsed: true,
          items: [
            { label: 'Agent Configuration Schema', link: '/reference/config/agent/' },
            { label: 'Chat App Configuration', link: '/reference/config/chat-app/' },
            { label: 'Platform Settings', link: '/reference/config/platform/' },
          ]
        },
        {
          label: 'API Reference',
          collapsed: true,
          items: [
            { label: 'REST API', link: '/reference/api/rest/' },
            { label: 'Pika UX Module API', link: '/reference/api/ux-module/' },
            { label: 'Web Component API', link: '/reference/api/web-components/' },
          ]
        },
        // ... more reference categories
      ]
    },

    {
      label: '🔧 Platform Info',
      collapsed: true,
      items: [
        {
          label: 'Releases',
          items: [
            { label: 'Latest Release', link: '/platform/releases/latest/' },
            { label: 'Changelog', link: '/platform/releases/changelog/' },
            { label: 'Migration Guides', link: '/platform/releases/migrations/' },
          ]
        },
        { label: 'Contributing', link: '/platform/contributing/' },
        { label: 'Troubleshooting & FAQ', link: '/platform/troubleshooting/' },
        { label: 'Community & Support', link: '/platform/community/' },
      ]
    },

]
}

```

---

## Migration Strategy

### Phase 1: Foundation (Weeks 1-2)
1. Set up new Astro/Starlight project
2. Configure Markdoc
3. Create new home page
4. Build basic navigation structure
5. Create templates for each content type

### Phase 2: Core Content (Weeks 3-5)
1. Create "Why Pika" section (NEW CONTENT)
2. Migrate and refactor Getting Started
3. Extract and reorganize Reference documentation
4. Create Capabilities overview pages

### Phase 3: Learning Path (Weeks 6-8)
1. Structure Training Course sections
2. Identify tutorial content from existing docs
3. Create module outlines
4. Begin video production planning

### Phase 4: Guides & Concepts (Weeks 9-11)
1. Transform Developer Guide into How-To Guides
2. Extract conceptual content into Concepts section
3. Create architecture diagrams
4. Write design rationale content

### Phase 5: Polish & Launch (Weeks 12-13)
1. Review all content
2. Add cross-links
3. Test navigation
4. Implement search
5. Launch new documentation
6. Redirect old URLs

---

## Content Audit & Mapping

### Current Features → New Structure

| Current Location | New Location | Action |
|-----------------|--------------|---------|
| `/features/overview/` | `/capabilities/overview/` | Rewrite with focus on capabilities |
| `/features/key-concepts/` | `/concepts/overview/` | Expand and reorganize |
| `/features/advanced-chat-apps/` | `/capabilities/core/chat-apps/` | Reframe as capability |
| `/features/user-memory/` | `/capabilities/data/user-memory/` | Reframe as capability |
| `/features/built-on-aws/` | `/why/approach/aws/` + `/concepts/architecture/aws/` | Split into persuasion + technical |
| `/features/agents-as-config/` | `/capabilities/core/agents-as-config/` | Reframe as capability |
| `/features/self-correcting/` | `/capabilities/intelligence/self-correcting/` | Reframe as capability |
| [All other features] | Various capability categories | Categorize and reframe |

### Current Developer Guide → New Structure

| Current Location | New Location | Action |
|-----------------|--------------|---------|
| `/developer/getting-started/` | `/getting-started/quickstart/` | Consolidate |
| `/developer/installation/` | `/getting-started/installation/` | Move |
| `/developer/local-development/` | `/how-to/deployment/local/` | Transform to how-to |
| `/developer/aws-deployment/` | `/how-to/deployment/aws-cdk/` | Transform to how-to |
| `/developer/authentication/` | `/how-to/auth/integrate-auth/` | Transform to how-to |
| `/developer/project-structure/` | `/concepts/architecture/project-structure/` | Move to concepts |
| `/developer/session-management/` | Split | Concept → `/concepts/key-concepts/sessions/`, How-To → `/how-to/data/sessions/` |
| `/developer/api-reference/` | `/reference/api/` | Move and expand |
| `/developer/shared-types/` | `/reference/types/` | Move |
| [Technical how-tos] | `/how-to/*` | Transform to task-focused guides |
| [Conceptual content] | `/concepts/*` | Extract and expand |

---

## Success Metrics

### User Goals
1. **Time to First Success:** Users can deploy their first agent in < 20 minutes
2. **Capability Discovery:** Users can find relevant capabilities in < 2 clicks
3. **Problem Solving:** Users can find how-to guides for their specific task in < 3 clicks
4. **Understanding:** Users understand "why Pika" before investing time in tutorials

### Content Metrics
1. Reduce total navigation items from 56 to ~40
2. Eliminate duplicate content between Features and Developer sections
3. Create clear separation: Sell → Learn → Do → Understand → Reference
4. Enable progressive disclosure: High-level first, details on demand

### Business Metrics
1. Increase conversion from docs visitor to installation
2. Reduce support questions about "where to find X"
3. Increase completion of Getting Started tutorial
4. Increase Training Course enrollment

---

## Open Questions & Decisions Needed

### Content Decisions
1. **Training Course Videos:** What topics to prioritize? Estimated length per lesson?
2. **Capabilities Organization:** Final subcategories - are the proposed ones correct?
3. **Reference Depth:** How detailed should config schemas be? Auto-generate from code?

### Technical Decisions
1. **Search:** Use Starlight's built-in search or integrate external (Algolia, etc.)?
2. **Analytics:** What tool to track doc usage and navigation patterns?
3. **Versioning:** Do we need version switcher for docs? Current plan: latest only

### Design Decisions
1. **Visual Style:** Beyond Aptos example, any specific brand requirements?
2. **Code Examples:** Language preference order? (TypeScript → JavaScript → JSON?)
3. **Diagrams:** Tool for architecture diagrams? (Mermaid, Excalidraw, other?)

---

## Next Steps

1. **Review & Approve This Design Doc**
   - Stakeholder review
   - User research / feedback (if available)
   - Finalize structure

2. **Create Content Templates**
   - Template for each content type
   - Style guide for tone and formatting
   - Example pages

3. **Begin Phase 1 Implementation**
   - Set up Astro/Starlight project
   - Configure navigation
   - Create home page

4. **Content Creation Prioritization**
   - What MUST be done for launch?
   - What can be iterative post-launch?
   - Video production timeline

---

## Appendix A: Comparison - Old vs. New

### Old Structure Problems
```

Features (23 items)
├── Overview
├── Key Concepts [conceptual]
├── Advanced Chat Apps [capability]
├── User Memory [capability]
├── Session Management [capability]
├── Built on AWS [why/architecture]
├── Data Security [why/architecture]
├── LLM Agents [capability]
├── Agents as Config [capability]
├── Multi-Agent [capability]
├── Answer Reasoning [capability]
├── Self Correcting [capability]
├── LLM Feedback [capability]
├── Insights [capability]
├── Customizable [capability]
├── Web Components [capability]
├── AI UI [capability]
├── Instruction Assist [capability]
├── Instruction Aug [capability]
├── Direct Invocation [capability]
├── Inline Tools [capability]
├── MCP [capability]
└── Admin Site [capability]

Developer Guide (33 items)
├── Getting Started [tutorial]
├── Installation [tutorial]
├── Project Structure [concept]
├── Local Dev [how-to]
├── Sync System [concept/reference]
├── Session Mgmt [concept/how-to]
├── Customization [how-to]
├── Multi-Agent [how-to] [DUPLICATE]
├── Authentication [how-to]
├── Access Control [how-to]
├── Override Features [how-to]
├── Traces Feature [how-to]
├── Verify Response [how-to]
├── Disclaimer Notice [how-to]
├── Override User Data [how-to]
├── Entity Feature [how-to]
├── Custom Msg Tags [how-to]
├── Building Web Comp [how-to]
├── Deploying Web Comp [how-to]
├── Pika UX Module [reference]
├── Widget Tags [reference]
├── User Memory [how-to] [DUPLICATE]
├── Instruction Assist [how-to] [DUPLICATE]
├── Instruction Aug [how-to] [DUPLICATE]
├── Direct Invocation [how-to] [DUPLICATE]
├── Inline Tools [how-to] [DUPLICATE]
├── Site Admin [how-to]
├── Content Admin [how-to]
├── Stack Management [how-to]
├── Serverless [how-to]
├── Shared Types [reference]
├── MCP [how-to] [DUPLICATE]
├── AWS Deployment [how-to]
└── Troubleshooting [reference]

```

**Problems:**
- 6 duplicate topics between Features and Developer
- Mixed content types (conceptual, how-to, reference) in both sections
- No clear starting point
- No persuasion/sales content
- 56 items total - overwhelming

### New Structure Benefits
```

Why Pika (5 main topics)
└── Clear value proposition
└── Sales content separated

Getting Started (4 topics)
└── Clear entry point
└── Quick success

Training Course (5 modules)
└── Structured learning
└── Video + text

Capabilities (6 categories, ~25 total)
└── Organized by function
└── Benefit-focused
└── No duplication

How-To Guides (7 categories, ~30 total)
└── Task-focused
└── All developer guides consolidated
└── No conceptual content mixed in

Concepts & Architecture (5 categories)
└── All conceptual content
└── "Why" and "How it works"
└── Separate from how-tos

Reference (5 categories)
└── All technical lookups
└── Schemas, APIs, types
└── No narrative

Platform Info (4 topics)
└── Meta content organized
Benefits:

Clear separation of concerns
No duplication
Progressive disclosure
Sales content present
Clearer navigation
Total items: ~40 (28% reduction)

Appendix B: Sample Content Migration
Example 1: "Authentication" Migration
Current State:

Location: /docs/developer/authentication/
Type: Mix of concept and how-to
Length: Long, detailed

New State:

Concept Page: /concepts/key-concepts/authentication/

markdown# Authentication in Pika

## How Authentication Works

[Conceptual explanation of authentication flow]

## Authentication Architecture

[Diagram and explanation]

## Design Decisions

[Why we chose this approach]

## Security Model

[How auth ties into security]

How-To Guide: /how-to/auth/integrate-auth/

markdown# How to Integrate Your Authentication System

## What You'll Accomplish

[Integrate external auth provider]

## Prerequisites

- Running Pika instance
- Auth provider credentials

## Steps

1. Configure environment variables
2. Implement auth adapter
3. Test authentication flow

## Testing

[Verification steps]

## Troubleshooting

[Common issues]

Reference: /reference/config/authentication/

markdown# Authentication Configuration Reference

## Environment Variables

| Variable      | Type   | Required | Description |
| ------------- | ------ | -------- | ----------- |
| AUTH_PROVIDER | string | Yes      | ...         |

## AuthAdapter Interface

[TypeScript interface definition]

Example 2: "Self-Correcting" Migration
Current State:

Location: /docs/features/self-correcting/
Type: Mix of "what it is" and "why it matters"

New State:

Capability: /capabilities/intelligence/self-correcting/

markdown# Self-Correcting Responses

## What It Does

Pika evaluates agent responses using an independent LLM and implements a feedback loop to improve quality.

## Why It Matters

Catches errors before they reach users. Improves response quality over time without manual intervention.

## Use Cases

- Customer-facing chatbots where accuracy is critical
- Complex multi-step reasoning tasks
- Agents working with sensitive data

## Key Features

- Independent LLM verification
- Automatic correction loop
- Configurable correction attempts
- Quality metrics tracking

## Getting Started

→ Enable Self-Correcting in How-To Guide
→ Learn about the architecture in Concepts
→ Configure parameters in Reference

## Related Capabilities

- Answer Reasoning
- LLM-Generated Feedback

Concept: /concepts/key-concepts/self-correcting/

markdown# Understanding Self-Correction

## The Problem

[Why normal agent responses can be wrong]

## How Self-Correction Works

[Detailed explanation with diagram]

1. Initial response generation
2. Independent verification
3. Feedback loop
4. Final response

## Design Trade-offs

[Latency vs. accuracy, etc.]

## When to Use

[Guidelines for when self-correction adds value]

How-To: /how-to/intelligence/enable-self-correcting/

markdown# How to Enable Self-Correcting Responses

## What You'll Accomplish

Configure an agent to use self-correction

## Prerequisites

- Agent configured
- Sufficient model quota

## Steps

[Step-by-step configuration]

## Configuration Options

[Available parameters]

## Testing

[How to verify it's working]

Document History
VersionDateAuthorChanges1.02025-10-24Design TeamInitial draft

Sign-off

Product Owner Approval
Technical Lead Approval
Content Lead Approval
Ready for Implementation
