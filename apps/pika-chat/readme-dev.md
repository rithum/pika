# Pika Chat Web App - Local Development

## Quick Start for Local Development

### Prerequisites

- Node.js 22+
- pnpm package manager
- AWS CLI configured with credentials

### 1. Environment Variables

Create a file named `.env.local` in the `apps/pika-chat` directory.

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
