import { type AgentActionGroup, CustomControlMethod, InvocationInputMember } from '@aws-sdk/client-bedrock-agent-runtime';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isJSONRPCRequest, type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { IncomingMessage, ServerResponse } from 'http';
import { type McpToolDefinition } from 'pika-shared/types/chatbot/chatbot-types';
import { type ReturnControlContext, type ToolContext } from './model-types-utils';
import { jsonparse } from './jsonparse';
import { parsers } from './tool-input-parser';

export enum TransportType {
    STREAMABLE_HTTP = 'streamable-http',
    STDIO = 'stdio',
    SSE = 'sse'
}

const SSE_HEADERS_PASSTHROUGH = ['authorization'];
const STREAMABLE_HTTP_HEADERS_PASSTHROUGH = ['authorization', 'mcp-session-id', 'last-event-id'];

async function fetchAccessToken(client_id: string, client_secret: string, token_url: string): Promise<{ accessToken: string; expires: number }> {
    let hash = createHash('sha256').update(`${token_url}:${client_secret}:${client_id}`).digest('hex');

    let tokenDir = process.env.AWS_LAMBDA_FUNCTION_NAME ? '/tmp/oauth-tokens' : './oauth-tokens';
    let tokenPath = `${tokenDir}/${hash}.json`;
    if (existsSync(tokenPath)) {
        let data = JSON.parse(readFileSync(tokenPath, 'utf8'));
        if (data.expires > Date.now()) {
            return {
                accessToken: data['access_token'],
                expires: data.expires
            };
        }
    }
    try {
        let url = token_url + '?grant_type=client_credentials&client_id=' + client_id + '&client_secret=' + client_secret;
        let response2 = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        let response: any = await response2.json();
        mkdirSync(tokenDir, { recursive: true });
        response.expires = Date.now() + response.expires_in * 1000;
        writeFileSync(tokenPath, JSON.stringify(response, null, 2));
        return {
            accessToken: response['access_token'],
            expires: response.expires
        };
    } catch (e) {
        console.log('Error fetching access token', e);
        throw e;
    }
}

// Function to get HTTP headers.
// Supports only "sse" and "streamable-http" transport types.
const getHttpHeaders = (req: any, transportType: TransportType) => {
    const headers: Record<string, string> = {
        Accept: transportType === 'sse' ? 'text/event-stream' : 'text/event-stream, application/json'
    };
    const defaultHeaders = transportType === 'sse' ? SSE_HEADERS_PASSTHROUGH : STREAMABLE_HTTP_HEADERS_PASSTHROUGH;
    for (const key of defaultHeaders) {
        if (req.headers[key] === undefined) {
            continue;
        }
        const value = req.headers[key];
        headers[key] = Array.isArray(value) ? value[value.length - 1] : value;
    }
    // If the header "x-custom-auth-header" is present, use its value as the custom header name.
    if (req.headers['x-custom-auth-header'] !== undefined) {
        const customHeaderName = req.headers['x-custom-auth-header'];
        const lowerCaseHeaderName = customHeaderName.toLowerCase();
        if (req.headers[lowerCaseHeaderName] !== undefined) {
            const value = req.headers[lowerCaseHeaderName];
            headers[customHeaderName] = value;
        }
    }
    return headers;
};

const createTransport = async (req: { query: { transportType: TransportType; url: string } }) => {
    const query = req.query;
    console.log('Query parameters:', JSON.stringify(query));
    const transportType = query.transportType;
    // if (transportType === "stdio") {
    //     const command = query.command;
    //     const origArgs = shellParseArgs(query.args);
    //     const queryEnv = query.env ? JSON.parse(query.env) : {};
    //     const env = { ...defaultEnvironment, ...process.env, ...queryEnv };
    //     const { cmd, args } = findActualExecutable(command, origArgs);
    //     console.log(`STDIO transport: command=${cmd}, args=${args}`);
    //     const transport = new StdioClientTransport({
    //         command: cmd,
    //         args,
    //         env,
    //         stderr: "pipe",
    //     });
    //     await transport.start();
    //     return transport;
    // }
    // else if (transportType === "sse") {
    //     const url = query.url;
    //     const headers = getHttpHeaders(req, transportType);
    //     console.log(`SSE transport: url=${url}, headers=${JSON.stringify(headers)}`);
    //     const transport = new SSEClientTransport(new URL(url), {
    //         eventSourceInit: {
    //             fetch: (url, init) => fetch(url, { ...init, headers }),
    //         },
    //         requestInit: {
    //             headers,
    //         },
    //     });
    //     await transport.start();
    //     return transport;
    // }
    // else
    if (transportType === 'streamable-http') {
        const headers = getHttpHeaders(req, transportType);
        const transport = new StreamableHTTPClientTransport(new URL(query.url), {
            requestInit: {
                headers
            }
        });
        await transport.start();
        return transport;
    } else {
        console.error(`Invalid transport type: ${transportType}`);
        throw new Error('Invalid transport type specified');
    }
};

function createServerResponse(req: IncomingMessage) {
    let res = new ServerResponse(req) as ServerResponse & {
        text: () => Promise<string>;
        json: <T>() => Promise<T>;
    };

    let done: Promise<void> = new Promise((resolve, reject) => {
        let end = res.end;

        res.end = ((...args: any[]) => {
            if (args[0]) {
                rawResponseBody = args[0];
            }
            resolve();
            // @ts-ignore
            return end.call(res, ...args);
        }) as any;
        res.on('end', () => {
            resolve();
        });
        res.on('error', (error) => {
            reject(error);
        });

        res.on('data', (chunk) => {
            rawResponseBody += chunk;
        });
    });
    let rawResponseBody = '';
    res.text = async () => {
        await done;
        return rawResponseBody;
    };
    res.json = async <T>() => {
        await done;
        return JSON.parse(rawResponseBody) as T;
    };
    return res;
}

function onClientError(error: Error) {
    console.error('Error from inspector client:', error);
}

function onServerError(error: Error) {
    if (error?.cause && JSON.stringify(error.cause).includes('ECONNREFUSED')) {
        console.error('Connection refused. Is the MCP server running?');
    } else if (error.message && error.message.includes('404')) {
        console.error('Error accessing endpoint (HTTP 404)');
    } else {
        console.error('Error from MCP server:', error);
    }
}

export default function mcpProxy({ transportToClient, transportToServer }: { transportToClient: StreamableHTTPServerTransport; transportToServer: StreamableHTTPClientTransport }) {
    let transportToClientClosed = false;
    let transportToServerClosed = false;
    let reportedServerSession = false;
    transportToClient.onmessage = (message: JSONRPCMessage | JSONRPCMessage[]) => {
        console.log('to client onmessage', JSON.stringify(message, null, 2));
        transportToServer.send(message).catch((error: Error) => {
            // Send error response back to client if it was a request (has id) and connection is still open
            if (isJSONRPCRequest(message) && !transportToClientClosed) {
                const errorResponse: JSONRPCMessage = {
                    jsonrpc: '2.0',
                    id: message.id,
                    error: {
                        code: -32001,
                        message: error.message,
                        data: error
                    }
                };
                transportToClient.send(errorResponse).catch(onClientError);
            }
        });
    };
    transportToServer.onmessage = (message: JSONRPCMessage) => {
        console.log('to server onmessage', JSON.stringify(message, null, 2));
        if (!reportedServerSession) {
            if (transportToServer.sessionId) {
                // Can only report for StreamableHttp
                console.error('Proxy  <-> Server sessionId: ' + transportToServer.sessionId);
            }
            reportedServerSession = true;
        }
        transportToClient.send(message).catch(onClientError);
    };
    transportToClient.onclose = () => {
        if (transportToServerClosed) {
            return;
        }
        transportToClientClosed = true;
        transportToServer.close().catch(onServerError);
    };
    transportToServer.onclose = () => {
        if (transportToClientClosed) {
            return;
        }
        transportToServerClosed = true;
        transportToClient.close().catch(onClientError);
    };
    transportToClient.onerror = onClientError;
    transportToServer.onerror = onServerError;
}

async function getOAuthToken(mcp: McpToolDefinition) {
    if (mcp.auth && (!mcp.auth.token || mcp.auth.token.expires < Date.now())) {
        mcp.auth.token = await fetchAccessToken(mcp.auth.clientId, mcp.auth.clientSecret, mcp.auth.tokenUrl);
    }
    return mcp.auth?.token?.accessToken;
}

interface McpServerManagerSettings {
    sessionAttributes: Record<string, any>;
    promptSessionAttributes: Record<string, any>;
}

class McpServerManager implements ToolContext {
    static GroupName = `mcp-servers`;
    servers: Record<string, McpServer> = {};

    constructor() {}

    getReturnControlHandlers() {
        return {
            [McpServerManager.GroupName]: async (event: InvocationInputMember, context: ReturnControlContext) => {
                let mcpServer = event.functionInvocationInput!.parameters?.find((p) => p.name == 'server_id');
                let mcp = this.servers[mcpServer?.value as string];
                if (!mcp) {
                    throw new Error(`Server ${mcpServer} not found.  Avaiable Servers are ${Object.keys(this.servers).join(', ')}`);
                }
                if (event.functionInvocationInput!.function == 'tools_list') {
                    return await mcp.listTools(context.sessionId);
                } else if (event.functionInvocationInput!.function == 'tools_call') {
                    let rawParams = event.functionInvocationInput!.parameters;
                    let params: Record<string, any> = (rawParams ?? []).reduce(
                        (p, c) => ({ ...p, [c.name!]: (parsers[c.type!] ?? parsers.identity)(c.value!) }),
                        {} as Record<string, any>
                    );

                    // Parse any json inputs
                    Object.entries(params).forEach(([key, value]) => {
                        if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
                            params[key] = jsonparse(value);
                        }
                    });

                    let flags = new Set<string>();
                    let args = params.arguments;
                    if (args.flags && args.flags.length > 0) {
                        flags = new Set(args.flags.split(':'));
                    }
                    delete args.flags;
                    if (flags.has('AG_PROXY')) {
                        let [actionGroup, functionName] = params.name.split('___');
                        if (actionGroup == null || functionName == null) {
                            throw new Error(`Invalid tool name: ${params.name}`);
                        }
                        Array.from(flags).forEach((f) => {
                            let [a, b] = f.split('=>');
                            if (a && b) {
                                let regex = new RegExp(a, 'g');
                                actionGroup = actionGroup.replace(regex, b);
                                functionName = functionName.replace(regex, b);
                            }
                        });
                        params.arguments = {
                            messageVersion: '1.0',
                            function: functionName,
                            parameters: Object.entries(args).map(([k, v]) => ({
                                name: k,
                                value: v,
                                type: typeof v === 'object' ? (Array.isArray(v) ? 'object' : 'object') : 'string'
                            })),
                            inputText: context.invokeCommand.inputText ?? '',
                            sessionId: context.sessionId,
                            agent: {
                                name: 'INLINE_AGENT',
                                version: 'INLINE_AGENT',
                                id: 'INLINE_AGENT',
                                alias: 'TSTALIASID'
                            },
                            actionGroup: actionGroup,
                            sessionAttributes: context.invokeCommand.inlineSessionState!.sessionAttributes ?? {},
                            promptSessionAttributes: context.invokeCommand.inlineSessionState!.promptSessionAttributes ?? {}
                        };
                    }

                    console.log('MCP Call Tools', mcp.mcp.toolId, params);
                    let r = await mcp.callTool(context.sessionId, params.name, params.arguments);

                    if (flags.has('AG_PROXY')) {
                        if (r.response?.functionResponse == null) {
                            throw new Error(r.text ?? 'Error Calling Tool');
                        }

                        if (r.response.functionResponse.responseState == null || r.response.functionResponse.responseState === 'SUCCESS') {
                            return r.response.functionResponse.responseBody.TEXT.body;
                        } else {
                            let error = r.response.functionResponse.responseBody.TEXT.body;
                            if (typeof error === 'string' && error.startsWith('{') && error.endsWith('}')) {
                                error = jsonparse(error);
                            }
                            throw new Error(error.message ?? error);
                        }
                    }
                    return r;
                } else {
                    throw new Error(`Tool ${event.functionInvocationInput!.function} not found`);
                }
            }
        };
    }

    getInstructions(tools: string[]): string {
        let mcps = tools.map((tool) => this.servers[tool]).filter((a) => a != null);
        if (mcps.length === 0) {
            return '';
        }
        return [
            '',
            '# MCP Servers',
            'IMPORTANT: Always check available MCP tools first before calling other general purpose action groups.',
            'MCP Servers are extra tools that can be used to call external services.',
            'You can use the tools_list function to list the available tools for an MCP server.',
            'You can use the tools_call function to call a tool on an MCP server to retrieve information.',
            'The tools_call function takes the following parameters:',
            '- server_id: The id of the MCP server to call the tool on.',
            '- name: The name of the tool to call.',
            '- arguments: The arguments to pass to the tool.',
            'Available MCP servers are:',
            '<mcp-servers>',
            mcps.map((server) => `\t<mcp-server id="${server.mcp.toolId}">${server.mcp.description}</mcp-server>`).join('\n'),
            '</mcp-servers>'
        ].join('\n');
    }
    getActionGroups(tools: string[]): AgentActionGroup[] {
        let mcps = tools.map((tool) => this.servers[tool]).filter((a) => a != null);

        if (mcps.length === 0) {
            return [];
        }

        return [
            {
                actionGroupName: McpServerManager.GroupName,
                description: 'List and Call tool for an MCP server.',
                actionGroupExecutor: {
                    customControl: CustomControlMethod.RETURN_CONTROL
                },
                functionSchema: {
                    functions: [
                        {
                            name: 'tools_list',
                            description: 'List the tools available to use',
                            parameters: {
                                server_id: {
                                    type: 'string',
                                    description: 'Values are:\n <mcp-servers>\n' + mcps.map((server) => `${server.mcp.toolId}`).join(' | ') + '\n</mcp-servers>',
                                    required: true
                                }
                            }
                        },
                        {
                            name: 'tools_call',
                            description: 'Call a tool with the given name and arguments',
                            parameters: {
                                server_id: {
                                    type: 'string',
                                    description: 'Values are:\n <mcp-servers>\n' + mcps.map((server) => `${server.mcp.toolId}`).join(' | ') + '\n</mcp-servers>',
                                    required: true
                                },
                                name: {
                                    type: 'string',
                                    description: 'The tool name to call',
                                    required: true
                                },
                                arguments: {
                                    type: 'string',
                                    description: 'JSON string of the arguments to pass to the tool matching the schema from tools_list',
                                    required: true
                                }
                            }
                        }
                    ]
                }
            }
        ];
    }

    add(mcp: McpToolDefinition) {
        this.servers[mcp.toolId] = new McpServer(mcp);
    }

    async initialize(sessionId: string) {
        await Promise.all(
            Object.values(this.servers).map(async (server) => {
                await server.initialize(sessionId);
            })
        );
    }
    async end(sessionId: string) {
        await Promise.all(
            Object.values(this.servers).map(async (server) => {
                await server.end(sessionId);
            })
        );
    }
}

export function processMcpActionGroup(mcp: McpToolDefinition, context: Record<string, ToolContext>, settings: McpServerManagerSettings) {
    let mcpServerManager = context.mcpServerManager as McpServerManager;
    if (!mcpServerManager) {
        mcpServerManager = new McpServerManager();
        context.mcpServerManager = mcpServerManager;
    }
    mcpServerManager.add(mcp);
}

export class McpServer {
    sessionData: Map<
        string,
        {
            internalSessionId: string;
            progressToken: number;
            webAppTransport: StreamableHTTPServerTransport;
            serverTransport: StreamableHTTPClientTransport;
        }
    >;
    mcp: McpToolDefinition;
    constructor(mcp: McpToolDefinition) {
        this.sessionData = new Map();
        this.mcp = mcp;
    }

    async postMessage(message: any, sessionId?: string) {
        console.log(`Received POST message for sessionId ${sessionId}`);

        if (!sessionId) {
            throw new Error('SessionId is required');
        } else {
            let sessionData = this.sessionData.get(sessionId);
            if (!sessionData) {
                throw new Error('SessionData not found for sessionId ' + sessionId);
            }

            message.jsonrpc = '2.0';
            message.id = ++sessionData.progressToken;
            message.params._meta = {
                progressToken: message.id
            };

            let headers: Record<string, string> = {};
            let token = await getOAuthToken(this.mcp);
            if (token) {
                headers.authorization = `Bearer ${token}`;
            }

            let req = {
                method: 'POST',
                body: message,
                query: {
                    transportType: 'streamable-http',
                    url: this.mcp.url
                },
                headers: {
                    'content-type': 'application/json',
                    accept: 'text/event-stream, application/json',
                    ...headers,
                    'mcp-session-id': sessionData.internalSessionId
                }
            } as any;
            let res = createServerResponse(req);
            await sessionData.webAppTransport.handleRequest(req, res, message);
            return res;
        }
    }

    async deleteMessage(sessionId: string) {
        console.log(`Received DELETE message for sessionId ${sessionId}`);

        if (sessionId) {
            let sessionData = this.sessionData.get(sessionId);
            if (!sessionData) {
                throw new Error('SessionData not found for sessionId ' + sessionId);
            }

            await sessionData.serverTransport.terminateSession();
            this.sessionData.delete(sessionId);
            console.log(`Transports removed for sessionId ${sessionId}`);
        }
    }

    async initialize(sessionId: string): Promise<string> {
        let headers: Record<string, string> = {};
        let token = await getOAuthToken(this.mcp);
        if (token) {
            headers.authorization = `Bearer ${token}`;
        }
        let req = {
            method: 'POST',
            body: {
                method: 'initialize',
                params: {
                    protocolVersion: '2025-06-18',
                    capabilities: {
                        sampling: {},
                        elicitation: {},
                        roots: { listChanged: true }
                    },
                    clientInfo: {
                        name: 'mcp-pika',
                        version: '0.16.5'
                    },
                    _meta: {
                        progressToken: 0
                    }
                },
                jsonrpc: '2.0',
                id: 0
            },
            query: {
                transportType: 'streamable-http',
                url: this.mcp.url
            },
            headers: {
                'content-type': 'application/json',
                accept: 'text/event-stream, application/json',
                ...headers
            }
        } as any;

        console.log('New StreamableHttp connection request');
        let serverTransport: StreamableHTTPClientTransport;
        try {
            serverTransport = await createTransport(req);
        } catch (error) {
            console.error('Error creating transport', error);
            // if (error instanceof SseError && error.code === 401) {
            // 	console.error("Received 401 Unauthorized from MCP server:", error.message);
            // 	res.status(401).json(error);
            // 	return;
            // }
            throw error;
        }
        console.log('Created StreamableHttp server transport');
        const webAppTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: randomUUID,
            enableJsonResponse: true,
            onsessioninitialized: (internalSessionId: string) => {
                this.sessionData.set(sessionId, {
                    internalSessionId: internalSessionId,
                    progressToken: 0,
                    webAppTransport: webAppTransport,
                    serverTransport: serverTransport
                });
                console.log('Client <-> Proxy  sessionId: ' + sessionId);
            }
        });
        console.log('Created StreamableHttp client transport');
        await webAppTransport.start();
        mcpProxy({
            transportToClient: webAppTransport,
            transportToServer: serverTransport
        });

        let res = createServerResponse(req);
        await webAppTransport.handleRequest(req, res, req.body);
        let j = (await res.json()) as any;
        if (j.error) {
            throw new Error(j.error.message);
        }
        console.log('MCP Initialize Response', JSON.stringify(j, null, 2));
        return webAppTransport.sessionId!;
    }

    async listTools(sessionId: string) {
        let response = await this.postMessage(
            {
                method: 'tools/list',
                params: {
                    // "_meta": {
                    // 	"progressToken": 1
                    // }
                }
                // "jsonrpc": "2.0",
                // "id": 1
            },
            sessionId
        );
        let r = (await response.json()) as any;
        if (r.error) {
            throw new Error(r.error.message);
        }
        return r.result;
    }

    async callTool(sessionId: string, name: string, args: any) {
        let response = await this.postMessage(
            {
                method: 'tools/call',
                params: {
                    name: name,
                    arguments: args,
                    _meta: {
                        //progressToken: mcp.id
                    }
                }
            },
            sessionId
        );

        let r = (await response.json()) as any;
        if (r.error) {
            throw new Error(r.error.message);
        }

        let result = r.result;
        if (Array.isArray(r.result?.content)) {
            r.result.content = r.result.content.map((c: any) => {
                if (c.type === 'text' && c.text.startsWith('{') && c.text.endsWith('}')) {
                    return jsonparse(c.text);
                } else {
                    return c;
                }
            });
            if (r.result.content.length === 1) {
                result = r.result.content[0];
            }
        }

        return result;
    }

    async end(sessionId: string) {
        await this.deleteMessage(sessionId);
    }
}
