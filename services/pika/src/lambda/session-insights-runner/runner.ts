import { pikaConfig } from '../../../../../pika-config';
let stage = process.argv[2] ?? 'test';
//let name = "ai-bot";
let name = pikaConfig.pika.projNameKebabCase;
process.env.AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';
process.env.STAGE = stage;
process.env.CHAT_APP_TABLE = `chat-app-${name}-${stage}`;

process.env.AGENT_DEFINITIONS_TABLE = `agent-definitions-${name}-${stage}`;
//process.env.CHAT_ADMIN_API_ID = appConfig.chatApiId;
process.env.CHAT_MESSAGES_TABLE = `chat-message-${name}-${stage}`;
process.env.CHAT_SESSION_TABLE = `chat-session-${name}-${stage}`;
process.env.CHAT_USER_TABLE = `chat-user-${name}-${stage}`;
process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE = name;
process.env.TOOL_DEFINITIONS_TABLE = `tool-definitions-${name}-${stage}`;
process.env.SESSION_RUNNER_MUTEX_TABLE = `session-runner-mutex-${name}-${stage}`;

process.env.IS_LOCAL = (!process.env.AWS_LAMBDA_FUNCTION_NAME).toString();

import { handler } from './index';
handler({}, {} as any)
    .then((d: any) => console.log('Data:', d))
    .catch((e: any) => console.log('Error:', e))
    .finally(() => console.log('Done'));
