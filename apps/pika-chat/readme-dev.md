# Chatbot Web App

### Local environment variables

Create a file in apps/chatbot named `.env.local`

You will need an entry for everything in [AppConfig](src/lib//server/server-types.ts) except for these

* isLocal: we detect this and will oerwrite whatever you put here
* awsAccount: set it if you want it hardcoded, otherwise we will pull it from logged in AWS info using STS 
* awsRegion: set it if you want it hardcoded, otherwise we will pull it from logged in AWS info using STS 


[See config](src/lib/server/config.ts)

### Prerequisites for Deploying to CloudFormation

### Client ID

You must have an encrypted ssm param named `/stack/pika-chat/${stage}/auth/client-id` whose value is the client ID for chat to auth.

### Master Cookie Key && Mater Cookie Init Vector

Today we encrypt all cookies in browser sessions with a master key.  Use this tool to generate one: `pnpm run master-key:generate`.

Then create two SSM params named:

* `/stack/pika-chat/${stage}/auth/master-cookie-key` and put the AES-256 key that was generated in it and make sure to select `SecureString` as the type.
* `/stack/pika-chat/${stage}/auth/master-cookie-init-vector` and put the Initialization Vector that was generated in it and make sure to select `SecureString` as the type.


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