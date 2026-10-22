# Pika Chat Web App - Local Development

## Quick Start for Local Development

### Prerequisites

- Node.js 22+
- pnpm package manager
- AWS CLI configured with credentials

### 1. Environment Variables

Generate `.env.local` from the deployed stack. This is the fast path and needs no hand-editing:

```bash
pnpm run env:local test -w
```

That reads the deployed `pika-chat-test` ECS task definition and writes `apps/pika-chat/.env.local`
with every variable the app needs, plus two local-dev settings: `PIKA_LOCAL_MOCK_AUTH=true` (see
[Running without signing in](#running-without-signing-in)) and `LOCAL_CONVERSE_FUNCTION_URL`
pointed at a local Strands server at `http://127.0.0.1:<port>`, with the deployed Strands function URL
commented out as an option. The value must be a loopback or Lambda function URL. Omit `-w` to print
to stdout instead. Requires AWS credentials for the account holding the stacks.

The file is gitignored, so a fresh clone or worktree will not have one and `pnpm run dev` fails
with `STAGE is not set`. Re-run the command rather than copying the file between worktrees.

`LOCAL_CHAT_API_BASE_URL`, `LOCAL_CONVERSE_FUNCTION_URL` and `PIKA_LOCAL_MOCK_*` are read from
`.env.local` under plain `pnpm dev`, so `pnpm run dev:nosudo` is optional. It starts a local Strands
converse server and then runs vite.

### Local tool environment variables

| Variable | Used by | Meaning |
| --- | --- | --- |
| `STAGE` | both tools | Stage to read (`env:local` takes it as an argument, default `test`) |
| `PIKA_SERVICE_PROJ_NAME_KEBAB_CASE` | both tools | Service project name, default `pika` |
| `PIKA_CHAT_PROJ_NAME_KEBAB_CASE` | `env:local` | Chat project name used to find the ECS cluster, default `pika-chat` |
| `PIKA_LOCAL_WEBAPP_URL` | `env:local` | Value written as `WEBAPP_URL`, default `https://localhost:<VITE_PORT>` |
| `STRANDS_PORT` | both tools | Local Strands port, default `8765` |
| `VITE_PORT` | both tools | Vite port, default `8443` |
| `PIKA_LOCAL_LOG_DIR` | `dev:nosudo` | Directory for the Strands log, default `.local-logs` at the repo root |
| `PIKA_SKIP_LOCAL_STRANDS` | `dev:nosudo` | Set to `1` to skip the local Strands server and use the routing in `.env.local` |
| `PYTHON_VERSION` | `dev:nosudo` | Python version for the Strands venv, default `3.14` |

### Running without signing in

Local dev otherwise performs the full login round-trip. To skip it:

```
PIKA_LOCAL_MOCK_AUTH=true
```

This works only when running locally and is refused inside ECS or Lambda. You are then a mock user,
configured with these variables:

- `PIKA_LOCAL_MOCK_USER_ID`: user id, default `local-dev-user`
- `PIKA_LOCAL_MOCK_FIRST_NAME`, `PIKA_LOCAL_MOCK_LAST_NAME`: display name
- `PIKA_LOCAL_MOCK_USER_TYPE`: user type
- `PIKA_LOCAL_MOCK_ROLES`: comma-separated roles, default `pika:content-admin,pika:site-admin`
- `PIKA_LOCAL_MOCK_ACCOUNT_ID`, `PIKA_LOCAL_MOCK_ACCOUNT_TYPE`: account context; when unset, the "Switch Account Context" dialog prompts
- `PIKA_LOCAL_MOCK_AUTH_PROVIDER`: auth provider name

Everything else is unchanged: the app still talks to the deployed chat API for whatever `STAGE`
says and still needs valid AWS credentials.

**Changing any `PIKA_LOCAL_MOCK_*` value takes a restart *and* a cookie clear.** The identity is
stored in an encrypted cookie, and `hooks.server.ts` only calls `authenticate()` when no user
cookie is present, so a restart alone leaves you as the previous user. Clear it with **Logout**,
or by visiting `/logout-now`.

Do not use `/force-reauth` for this: under `isLocal` it returns a static page built outside
`resolve()`, so the cookie deletions it records are never sent to the browser and nothing is
actually cleared.

### Setting the rest by hand

If you would rather build the file yourself, create `.env.local` in `apps/pika-chat` manually.

You will need an entry for everything in [AppConfig](src/lib//server/server-types.ts) except for these auto-detected values:

- `isLocal`: we detect this and will override whatever you put here
- `awsAccount`: set it if you want it hardcoded, otherwise we will pull it from logged in AWS info using STS
- `awsRegion`: set it if you want it hardcoded, otherwise we will pull it from logged in AWS info using STS

[See config](src/lib/server/config.ts)

### 2. Cookie Encryption Setup

**If the stack hasn't yet been deployed to AWS and you want to run locally, you must first set up cookie encryption infrastructure:**

```bash
# Check if encryption infrastructure exists
pnpm run encryption:setup -- status

# Set up encryption infrastructure for local development
pnpm run encryption:setup -- setup
```

This creates the necessary KMS keys and SSM parameters without deploying the full CloudFormation stack.

**Alternative:** If you want to test with the full infrastructure, deploy the complete stack:

```bash
pnpm run cdk:deploy
```

### 3. Start Development Server

```bash
pnpm run dev
```

## Troubleshooting

### "Cookie encryption infrastructure is not set up" Error

If you see this error when starting the dev server, run:

```bash
pnpm run encryption:setup -- setup
```

### Check Infrastructure Status

```bash
pnpm run encryption:setup -- status
```

### Clean Up Infrastructure

```bash
pnpm run encryption:setup -- cleanup --force
```

** Warning:** This deletes all encryption infrastructure and cannot be undone!

### Prerequisites for Deploying to CloudFormation

### Client ID

You must have an encrypted ssm param named `/stack/${chat-app-proj-name-kebab-case}/${stage}/auth/client-id` whose value is the client ID for chat to auth.

## Docker

### Installation

You will need docker to build the ECS container.

On mac: `brew install --cask docker`

### Gotchas

If you get

ERROR: failed to solve: node:22-alpine: failed to resolve source metadata for docker.io/library/node:22-alpine: failed to authorize: failed to fetch oauth token: unexpected status from GET request to https://auth.docker.io/token?scope=repository%3Alibrary%2Fnode%3Apull&service=registry.docker.io: 401 Unauthorized

Then do this at the command line

`docker login -u`

### File Size

If the docker file gets big, do `pnpm run docker:ssh` and then run

`find / -type d \( -name "node_modules" -o -name ".pnpm" -o -name "dist" -o -name "build" \) -exec du -sh {} \; 2>/dev/null | sort -hr`
