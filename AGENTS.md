# pika

## Overview

Open-source chat platform framework for building AI-powered conversational applications on AWS. Provides a SvelteKit frontend, Lambda/CDK backend, shared type system, Serverless Framework plugin, CLI tooling, and a documentation site. Used as the foundation for derivative apps (e.g., ai-bot).

## Tech Stack

- **Language**: TypeScript (strict mode, no `any`)
- **Frontend**: SvelteKit 2, Svelte 5 (runes), Vite 7, Tailwind CSS 4, bits-ui
- **Docs site**: Astro 5, Starlight, Markdoc
- **Backend**: AWS Lambda (Node 22), AWS CDK 2
- **AI/LLM**: AWS Bedrock (Claude), Bedrock Agents
- **State**: DynamoDB (sessions, messages, users)
- **Storage**: S3 (assets, file uploads)
- **Search**: OpenSearch (session analytics)
- **Auth**: `@auth/sveltekit`, JWT via `x-chat-auth`, Cognito
- **Build**: pnpm 10, Turborepo, tsup, esbuild
- **Test**: Jest 29, ts-jest
- **CI/CD**: GitHub Actions, Semantic Release

## Architecture

Monorepo managed by pnpm workspaces + Turborepo.

### Published packages (npm)

| Path | Package | Purpose |
|------|---------|---------|
| `packages/shared/` | `pika-shared` | Shared types, utilities, error classes |
| `packages/pika-ux/` | `pika-ux` | Svelte UI component library (shadcn-style) |
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
- Tests depend on `build` in Turbo pipeline
- Jest uses `ts-jest` preset with module mapping for `pika-shared`

## Key Patterns

1. **API Gateway handlers**: Use `apiGatewayFunctionDecorator` from `pika-shared/util/api-gateway-utils`. It parses bodies, catches errors, formats responses. See `services/pika/src/api/chatbot/index.ts`.

2. **Route tables**: Handlers define routes as `METHOD:path/{param}` mapped to handler functions. `findMatchingRoute` resolves templates and extracts path params.

3. **Shared error types**: Throw `HttpStatusError` subclasses from `pika-shared/util/` — the decorator translates them to HTTP status codes. Never use raw `Error` for API responses.

4. **CDK infrastructure**: Lives alongside code — `services/pika/lib/` for backend, `apps/pika-chat/infra/` for frontend. Deploy via `pnpm cdk:deploy:test` or `pnpm cdk:deploy:prod`.

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
- **Files touched by release**: `releases.json`, `CHANGELOG.md`, `apps/pika-docs/src/content/docs/platform/releases/changelog.mdoc`
- **Breaking changes** also create migration guides in `apps/pika-docs/src/content/docs/platform/releases/migration-guides/`
- **Auto-release**: GitHub Actions (`auto-release.yml`) creates GitHub releases from `releases.json` on push to `main`

## Domain Context

- **Sessions & Messages**: Core entities in DynamoDB. Sessions own messages and track conversation state per user.
- **Agents**: Bedrock agents with tool definitions, cached via LRU in converse Lambda.
- **Pika CLI**: `pika create-app` scaffolds new derivative apps. `pika sync` updates existing apps from the framework.
- **Feature flags**: `pika-config.ts` `siteFeatures` controls UI capabilities (home page, traces, file upload, tags, etc.)
- **Environments**: `test` and `production` stages via CDK context.

## Gotchas

- Lambda converse handler has a **30-second timeout** — agent tool execution must be fast
- DynamoDB table names come from **environment variables**, never hardcoded
- `pnpm build:packages` must complete before apps/services build (Turbo handles this automatically)
- Docker build for chat app needs `build/` output first — run `pnpm run docker:build-files` before `docker buildx build`
- Node 22+ required; `.nvmrc` says 23 but `engines` says `>=22`
- Published packages (`pika-shared`, `pika-ux`, `pika-serverless`, `pika-app`) — changes to these affect downstream consumers
- Commits must follow **Conventional Commits**: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- The docs site (`pika-docs`) uses Markdoc (`.mdoc` files), not standard Markdown
