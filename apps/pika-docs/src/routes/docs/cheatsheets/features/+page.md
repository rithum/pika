---
title: Pika Features Overview
description: A concise overview of Pika features and workflow
outline: [2, 3]
---

<!-- Sourced from docs/features.md; headings normalized to start at ## -->

## Pika Features Overview

### 1. Fork, scaffold, and sync (Pika CLI + workflow)

- Scaffold a project: `pika create-app <name>` clones the framework, cleans artifacts, installs deps, and sets up protected areas and project metadata.
- Sync system: `pika sync` pulls framework updates while preserving your changes via protected areas, userProtectedAreas, userUnprotectedAreas, and smart `package.json` merging.
- Protected areas by default: `pika-config.ts`, custom auth provider, custom UI components, `apps/custom/`, `services/custom/`, env files, and any path starting with `custom-`.

### 2. Project structure and configuration

- Monorepo layout: `apps/` (frontends), `services/` (backends), `packages/` (shared libraries), `docs/`.
- Central config: `pika-config.ts` provides type-safe project naming and site-wide features; used by all stacks and tooling.
- Stacks: AWS CDK stacks for frontend (`apps/pika-chat`) and backend (`services/pika`), with `custom-stack-defs.ts` hooks for infra additions.

### 3. Frontend chat app (apps/pika-chat)

- Generic chat UI: Renders any chat app with responsive UX, chat history, and embed support (sample enterprise-site app demonstrates iframe/embedded mode).
- Authentication provider extension point: Implement your own SSO/OAuth/SAML/JWT in `apps/pika-chat/src/lib/server/auth-provider/` with secure cookie handling (auto multi-cookie split for large payloads) and typed `AuthenticatedUser<T,U>`.
- Custom message tags: Map XML tags from LLM responses to custom Svelte components and metadata handlers for rich UI (`custom-markdown-tag-components`).
- File upload & download: Configurable allowed MIME types; download helpers for server-generated content.
- UI customization hooks: Prompt label, suggestions, left-nav options, and history behavior.
- Routes for auth UX: Built-in client-auth and logout routes for advanced auth flows.

### 4. Access control (secure-by-default)

- Explicit access required: `enabled: true` alone does not grant access. You must specify `userTypes` and/or `userRoles`.
- User types: `internal-user`, `external-user` (set by your auth provider).
- User roles: Framework roles like `pika:content-admin`, `pika:site-admin` plus your custom roles.
- Home page links control: Site rules map user types to which chat-app types are visible on the home page.

### 5. Site features (enable at site level; chat apps can further restrict)

- traces: AI reasoning, failures, and tool invocation visibility; optional `detailedTraces` with parameter traces.
- verifyResponse: Secondary verification + grading (A/B/C/F) with optional auto-reprompt threshold.
- chatDisclaimerNotice: Configurable disclaimer text visible to users.
- logout, fileUpload, suggestions, promptInputFieldLabel, uiCustomization, userDataOverrides, entity, siteAdmin, contentAdmin: Enable per site; apps may restrict via overrides.

### 6. Chat apps and overrides

- Chat app definition: Each app declares title, agent, mode (standalone/embedded), and feature overrides.
- Feature override hierarchy: Site → Chat App → Admin Override; overrides fully replace lower levels and can only be more restrictive than site-level enablement.
- Admin overrides (Site Admin UI): Enable/disable apps, restrict by user IDs, entities (internal/external lists), roles/types, and home-page visibility.

### 7. User context features

- User Data Override: Authorized users can override `ChatUser.customData` per chat app via a custom UI component; persists until cleared or logout.
- Entity feature: Declarative entity-based access using `user.customData[attributeName]`, with admin autocomplete to manage allow-lists per app.
- Content Admin: Read-only impersonation to view another user’s sessions/messages for debugging and support.

### 8. Agents, tools, and orchestration (services/pika)

- Dynamic Agent Definition Framework: Central registry of agents and tools in DynamoDB; runtime composition with access rules and rollout policies.
- Tool definitions: Lambda-executed tools with typed input/output schemas, Bedrock function schemas, lifecycle and tagging.
- Toolsets: Group tools with shared access rules and versions.
- AWS Bedrock integration: Inline agents, streaming support, and custom response stream handling.
- Knowledge base integration: Bring-your-own sources; agent/tool orchestration supports external data.

### 9. Observability, quality, and transparency

- Traces: High-level reasoning and detailed tool parameter traces (when enabled) surfaced in the UI.
- Verify Response: Automatic grading and optional auto-reprompt; grades appear in traces.

### 10. Insights and feedback (analytics pipeline)

- Feedback system: Collect feedback; stored in DynamoDB and replicated to OpenSearch.
- Session insights: EventBridge-scheduled runner analyzes sessions and writes JSON to S3; OpenSearch kept in sync.
- OpenSearch indexing: Sessions enriched for query and analysis.

### 11. Deployment and environments

- Local development: pnpm-based; front/back stacks; auth mocking by default (development only).
- AWS deployment (CDK): Separate frontend and backend stacks; hooks for adding IAM and resources; environment variables for insights/OS.
- Security notes: Replace mock auth before production, assign `userType`, and configure `userTypes`/`userRoles` explicitly.

### 12. Samples and starter assets

- Weather sample: Reference chat app/agent and tools in `services/samples/weather`.
- Enterprise site sample: Embedded chat demonstration in `apps/samples/enterprise-site`.
- Shared packages: Types and utilities in `packages/shared`.

### 13. Key developer commands (CLI)

- `pika create-app <name>` and `pika sync [--dry-run|--diff|--visual-diff|--branch <name>|--debug]`.
