# pika

## Overview

Open-source chat platform framework for building AI-powered conversational applications on AWS. Provides a SvelteKit frontend, Lambda/CDK backend, shared type system, Serverless Framework plugin, CLI tooling, and a documentation site. Pika is a **framework, not a deployed application** — downstream repos (e.g., `ai-bot`) fork/extend pika and handle their own deployment. Pika itself only publishes npm packages and documentation.

## Tech Stack

- **Language**: TypeScript (strict mode, no `any`)
- **Frontend**: SvelteKit 2, Svelte 5 (runes), Vite 7, Tailwind CSS 4, shadcn-svelte (which pulls in bits-ui). Use shadcn-svelte components for new UI work.
- **Docs site**: Astro 5, Starlight, Markdoc
- **Backend**: AWS Lambda (Node 22), AWS CDK 2
- **AI/LLM**: AWS Bedrock (Claude), Bedrock Agents
- **State**: DynamoDB (sessions, messages, users)
- **Storage**: S3 (assets, file uploads)
- **Search**: OpenSearch (session analytics)
- **Auth**: `@auth/sveltekit`, JWT via `x-chat-auth`, Cognito
- **Build**: pnpm 10, Turborepo, tsup, esbuild
- **Test**: Jest 29 + ts-jest (unit/logic); Vitest + `@testing-library/svelte` + jsdom for Svelte 5 component/DOM tests (added v0.27.0)
- **CI/CD**: GitHub Actions (tests, npm publish, docs deploy). No application deployment — that's the downstream repo's job.

## Architecture

Monorepo managed by pnpm workspaces + Turborepo.

### Published packages (npm)

| Path | Package | Purpose |
|------|---------|---------|
| `packages/shared/` | `pika-shared` | Shared types, utilities, error classes |
| `packages/pika-ux/` | `pika-ux` | Svelte UI component library (shadcn-svelte based) |
| `packages/pika-cli/` | `pika-app` | CLI: `pika create-app`, `pika sync` |
| `packages/pika-serverless/` | `pika-serverless` | Serverless Framework plugin |
| `packages/eslint-config/` | `@pika/eslint-config` | Shared ESLint flat config |
| `packages/typescript-config/` | `@pika/typescript-config` | Shared tsconfig base |

### Internal packages

| Path | Package | Purpose |
|------|---------|---------|
| `packages/tools/` | `@pika/tools` | Release tooling scripts (notes, publish, validate) |
| `apps/pika-chat/` | `@pika/chat` | SvelteKit chat frontend |
| `apps/pika-docs/` | `pika-docs` | Astro/Starlight documentation site |
| `services/pika/` | `@pika/service` | Core backend: CDK stack, Lambda handlers |

### Samples

| Path | Purpose |
|------|---------|
| `apps/samples/enterprise-site/` | Example enterprise integration |
| `services/samples/weather/` | Weather service CDK + Lambda example |
| `services/samples/weather-direct/` | Weather direct variant |
| `services/samples/random-num-inline/` | Inline Lambda example |

**Dependency flow**: Services and apps import from `pika-shared`. Apps also import from `pika-ux`. Turbo ensures build order via `^build` dependency.

**Central config**: `pika-config.ts` at root drives project names, feature flags (`siteFeatures`), stack tags, and Vite settings.

## Coding Conventions

- **No `any`**: Always use proper TypeScript types
- **Error handling**: Guard clauses first, throw typed errors (`HttpStatusError`, `BadRequestError`, `UnauthorizedError`, `ForbiddenError` from `pika-shared/util/`), happy path last. Never swallow errors — bubble to handler level.
- **Naming**: camelCase for variables/functions, kebab-case for files. Handlers export `handlerFn` (internal) wrapped as `handler` via decorator.
- **Imports**: Use `pika-shared/types/...` and `pika-shared/util/...` paths
- **DRY**: Check `packages/shared/`, installed libs, and standard libs before writing new utilities. No duplicated logic >5 lines.
- **Svelte**: Svelte 5 runes (`$props()`, `$bindable`), `tailwind-variants` for variants, `cn()` for class merging
- **Constants**: No magic numbers/strings — define as named constants
- **Formatting**: Prettier — single quotes, no trailing commas, 180 char width, 4-space indent

## Build & Test

```bash
pnpm install                    # Install all dependencies
pnpm build                      # Build everything (turbo)
pnpm lint                       # Lint all packages
pnpm format                     # Prettier format all
pnpm check-types                # TypeScript type checking
pnpm test                       # Run all tests (turbo)
pnpm --filter @pika/service test  # Test specific package
```

- Tests live in `test/` directories, suffix `*.test.ts`
- **Two runners in `apps/pika-chat`**: Jest (`pnpm test`) for unit/logic tests, and Vitest + `@testing-library/svelte` + jsdom (`pnpm test:components`) for Svelte 5 component/DOM tests. `pnpm test` (jest) **excludes** `test/components/` (vitest's) and `test/integration/`, so a component test placed outside `test/components/` silently won't run under the runner you expect.
- Tests depend on `build` in Turbo pipeline
- Jest uses `ts-jest` preset with module mapping for `pika-shared`

## Key Patterns

1. **API Gateway handlers**: Use `apiGatewayFunctionDecorator` from `pika-shared/util/api-gateway-utils`. It parses bodies, catches errors, formats responses. See `services/pika/src/api/chatbot/index.ts`.

2. **Route tables**: Handlers define routes as `METHOD:path/{param}` mapped to handler functions. `findMatchingRoute` resolves templates and extracts path params.

3. **Shared error types**: Throw `HttpStatusError` subclasses from `pika-shared/util/` — the decorator translates them to HTTP status codes. Never use raw `Error` for API responses.

4. **CDK infrastructure**: Lives alongside code — `services/pika/lib/` for backend, `apps/pika-chat/infra/` for frontend. These are **reference implementations** — deployment happens in downstream repos, not from pika directly.

## Release Process

Pika has custom release tooling in `packages/tools/`. See `RELEASING.md` for full details.

```bash
pnpm release:notes              # Draft release notes (interactive)
pnpm release:notes:finalize     # Mark version as released
pnpm release:publish [version]  # Create git tag
pnpm release:validate           # Validate releases.json + CHANGELOG
pnpm release:plan-breaking      # Plan breaking change + migration guide
```

- **Branch naming determines version bump**: `feat/` → minor, `fix/` → patch, `breaking/` → breaking change
- **Files touched by every release**: `releases.json`, `CHANGELOG.md`, `apps/pika-docs/src/content/docs/platform/releases/changelog.mdoc`, **and** `apps/pika-docs/src/content/docs/platform/releases/index.mdoc` (the "What's New" section, the "Latest Stable" line, and the Version History table at the bottom). The `release:notes` prompt lists all four — don't skip `index.mdoc`.
- **Breaking changes** also create a migration guide in `apps/pika-docs/src/content/docs/platform/releases/migration-guides/` **and** register it in `apps/pika-docs/sidebar-config.ts` (Migration Guides list, newest first)
- **Auto-release**: GitHub Actions (`auto-release.yml`) creates GitHub releases from `releases.json` on push to `main`

## Domain Context

- **Sessions & Messages**: Core entities in DynamoDB. Sessions own messages and track conversation state per user.
- **Agents**: Bedrock agents with tool definitions, cached via LRU in converse Lambda.
- **Pika CLI**: `pika create-app` scaffolds new derivative apps. `pika sync` updates existing apps from the framework.
- **Feature flags**: `pika-config.ts` `siteFeatures` controls UI capabilities (home page, traces, file upload, tags, etc.)
- **No deployment from pika**: Pika publishes npm packages and docs. Application deployment (CDK stacks, Docker, Fargate) is handled by downstream repos like `ai-bot`.

## Gotchas

- **Python Lambdas run on arm64 (Graviton).** CDK bundling `platform:` must be `linux/arm64` so pip resolves `manylinux_aarch64` wheels — a mismatch produces amd64 `.so` files that fail at Lambda INIT with `ModuleNotFoundError: No module named 'pydantic_core._pydantic_core'` or similar. On x86_64 CI runners, `docker/setup-qemu-action@v3` + `docker/setup-buildx-action@v3` must run before `cdk deploy`. See `guides/advanced/strands-converse` for the full wiring.
- Lambda converse handler has a **30-second timeout** — agent tool execution must be fast
- DynamoDB table names come from **environment variables**, never hardcoded
- `pnpm build:packages` must complete before apps/services build (Turbo handles this automatically)
- Docker build for chat app needs `build/` output first — run `pnpm run docker:build-files` before `docker buildx build`
- Node 22+ required; `.nvmrc` says 23 but `engines` says `>=22`
- Published packages (`pika-shared`, `pika-ux`, `pika-serverless`, `pika-app`) — changes to these affect downstream consumers
- Commits must follow **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- The docs site (`pika-docs`) uses Markdoc (`.mdoc` files), not standard Markdown
- **When adding or removing a docs page**, you must also update `apps/pika-docs/sidebar-config.ts` — the `starlight-sidebar-topics` plugin requires every page to be registered in the sidebar. Always run `pnpm --filter "pika-docs" run build` locally to verify before committing.
