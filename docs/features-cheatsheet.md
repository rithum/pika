## Pika Features Cheat Sheet (how to use each feature quickly)

### 1. Fork, scaffold, and sync (Pika CLI + workflow)

- Install pnpm and CLI: `npm i -g pnpm @pika/cli`.
- Create app: `pika create-app my-app` → open the new repo.
- Review `.pika-sync.json` protected areas; add any of your custom paths under `userProtectedAreas`.
- Pull updates safely: `pika sync --dry-run` → `pika sync --diff` → `pika sync` (or `--visual-diff`).
- Keep your changes inside protected/custom areas to avoid conflicts.
- See: `docs/developer/getting-started.md`, `docs/developer/installation.md`, `docs/developer/sync-system.md`.

### 2. Project structure and configuration

- Update `pika-config.ts` project names first; they drive stack/resource names.
- Configure `siteFeatures` here (home page, traces, verifyResponse, etc.).
- Infra hooks: use `apps/pika-chat/infra/lib/stacks/custom-stack-defs.ts` and `services/pika/lib/stacks/custom-stack-defs.ts` for IAM/resources.
- See: `docs/developer/project-structure.md`, `docs/developer/customization.md`.

### 3. Frontend chat app (apps/pika-chat)

- Authentication provider extension point

    - Create `apps/pika-chat/src/lib/server/auth-provider/index.ts` extending `AuthProvider<TAuth, TCustom>`.
    - In `authenticate()`, build `AuthenticatedUser<TAuth,TCustom>`; set `userType` and any `roles` (e.g., `pika:content-admin`).
    - Implement `validateUser()` to refresh/reauth as needed.
    - Optional client-side flow: use protected `routes/(noauth)/auth/client-auth/` files.
    - Replace mock auth before prod. Test with internal/external users.
    - See: `docs/developer/authentication.md`.

- Custom message tags (rich UI from LLM XML)

    - Add Svelte components under `custom-markdown-tag-components/` and register in `index.ts`.
    - Add metadata handlers for non-visual tags.
    - See: `docs/developer/custom-message-tags.md`.

- File upload & download

    - Enable `siteFeatures.fileUpload` and set `mimeTypesAllowed` in `pika-config.ts`.
    - See: `docs/developer/customization.md` (Site Features table).

- UI customization hooks

    - Configure `siteFeatures` for `promptInputFieldLabel`, `suggestions`, `uiCustomization`.
    - See: `docs/developer/customization.md`.

- Routes for auth UX
    - Use built-in client-auth and logout routes; wire your provider’s flows.
    - See: `docs/developer/authentication.md` (Client-side flow section).

### 4. Access control (secure-by-default)

- Always specify `userTypes` and/or `userRoles` on chat apps and features; `enabled: true` is not enough.
- Site home page links: configure `siteFeatures.homePage.linksToChatApps.userChatAppRules`.
- Understand precedence: Disabled → User IDs → Entities → General rules.
- See: `docs/developer/chat-app-access-control.md`, `docs/developer/site-admin-feature.md`.

### 5. Site features (enable at site level; chat apps can further restrict)

- traces

    - Enable at site level; optionally configure `detailedTraces` with user types/roles.
    - Chat apps may restrict further (complete override required).
    - See: `docs/developer/traces-feature.md`, `docs/developer/overriding-features.md`.

- verifyResponse

    - Enable and set `autoRepromptThreshold` (B/C/F). Provide access rules.
    - See: `docs/developer/verify-response-feature.md`, `docs/developer/overriding-features.md`.

- chatDisclaimerNotice

    - Set `notice` text at site (or per-app via override).
    - See: `docs/developer/chat-disclaimer-notice-feature.md`, `docs/developer/overriding-features.md`.

- logout, fileUpload, suggestions, promptInputFieldLabel, uiCustomization, userDataOverrides, entity, siteAdmin, contentAdmin
    - Enable in `pika-config.ts` → optional per-app override (complete config).
    - Role-gated features: `siteAdmin` requires `pika:site-admin`; `contentAdmin` requires `pika:content-admin`.
    - See: `docs/developer/customization.md`, `docs/developer/site-admin-feature.md`, `docs/developer/content-admin.md`, `docs/developer/overriding-features.md`, `docs/developer/entity-feature.md`, `docs/developer/overriding-user-data.md`.

### 6. Chat apps and overrides

- Define chat app (id/title/agent/mode/features) and specify access rules.
- Per-app feature overrides must include ALL settings for that feature.
- Use Site Admin UI for admin overrides: enable/disable, user IDs, entities, roles/types, home page filtering.
- See: `docs/developer/overriding-features.md`, `docs/developer/site-admin-feature.md`, `docs/developer/chat-app-access-control.md`, `docs/developer/entity-feature.md`.

### 7. User context features

- User Data Override

    - Enable `siteFeatures.userDataOverrides`.
    - Implement server hooks in `routes/(auth)/api/user-data-override/custom-user-data.ts` and a custom UI component in `chat/user-data-overrides/`.
    - Optionally force override when required attributes are missing.
    - See: `docs/developer/overriding-user-data.md`, `docs/developer/customization.md`.

- Entity feature

    - Enable `siteFeatures.entity` with `attributeName` pointing into `user.customData`.
    - Implement admin autocomplete: `routes/(auth)/api/site-admin/custom-data.ts#getValuesForEntityAutoComplete`.
    - See: `docs/developer/entity-feature.md`, `docs/developer/site-admin-feature.md`.

- Content Admin
    - Enable `siteFeatures.contentAdmin` and assign `pika:content-admin` to admins.
    - Access via chat UI menu; read-only viewing per chat app.
    - See: `docs/developer/content-admin.md`.

### 8. Agents, tools, and orchestration (services/pika)

- Define tools and agents in the Dynamic Agent Definition Framework (DynamoDB-backed models).
- ToolDefinition: lambda ARN (tagged `agent-tool`), input/output schemas or TS → JSON schema, lifecycle/tags.
- AgentDefinition: base prompt, access rules, tool references, rollout policy, cache status.
- ToolSets: group tools with shared access.
- Update chat app to reference `agentId`. Deploy services.
- See: `services/pika/docs/agent-definition-system.md`.

### 9. Observability, quality, and transparency

- Enable `traces` (and `detailedTraces` if needed) and `verifyResponse` at site level.
- Prefer enabling for internal users first; restrict detailed traces to admin roles.
- See: `docs/developer/traces-feature.md`, `docs/developer/verify-response-feature.md`.

### 10. Insights and feedback (analytics pipeline)

- Prereqs: OpenSearch domain, S3 bucket, DynamoDB tables; Bedrock access.
- Enable and deploy lambda set: session-changed, session-insights-runner, session-feedback-changed, etc.
- Runner: EventBridge every minute; writes insights JSON to S3; OpenSearch sync via stream processors.
- Configure env vars (e.g., PIKA_S3_BUCKET, CHAT_SESSION_TABLE, domain endpoint) and CDK settings.
- See: `docs/architecture/insights-and-feedback.md`.

### 11. Deployment and environments

- Local: build/deploy backend first (`services/pika`), then sample/chat apps, then frontend; run dev server.
- AWS: customize `custom-stack-defs.ts`, set domains/certs/regions; deploy with CDK.
- Security checklist: replace mock auth, assign `userType`, configure access rules, validate roles.
- See: `docs/developer/local-development.md`, `docs/developer/aws-deployment.md`, `docs/developer/authentication.md`, `docs/developer/stack-management.md`.

### 12. Samples and starter assets

- Weather sample: copy structure from `services/samples/weather` to jumpstart a chat app/tool.
- Enterprise site sample: see `apps/samples/enterprise-site` for embedding patterns.
- See: `docs/developer/project-structure.md`, `docs/developer/getting-started.md`.

### 13. Key developer commands (CLI)

- Create app: `pika create-app <name>` (then `pnpm dev`).
- Sync framework: `pika sync --dry-run|--diff|--visual-diff|--branch <name>|--debug`.
- See: `docs/developer/installation.md`, `docs/developer/sync-system.md`.
