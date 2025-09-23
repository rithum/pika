import {
    AgentDataRequest,
    AgentDefinitionForIdempotentCreateOrUpdate,
    ChatAppDataRequest,
    SemanticDirectiveDataRequest,
    ToolDefinitionForIdempotentCreateOrUpdate
} from 'pika-shared/types/chatbot/chatbot-types';

/**
 * Base tool definition with shared properties
 */
interface PikaToolBase {
    toolId: string;
    name: string;
    displayName?: string;
    description: string;
    executionTimeout?: number;
    functionSchema: any[];
    supportedAgentFrameworks: ['bedrock'];
    tags?: Record<string, string>;
    lifecycle?: any;
    accessRules?: any[];
    testType?: 'mock';
}

/**
 * Lambda tool definition that references a lambda function by its logical ID
 */
export interface PikaLambdaToolWithRef extends PikaToolBase {
    executionType: 'lambda';
    /**
     * The logical ID of the lambda function that backs this tool
     * This should match a function name defined in the functions section
     */
    lambdaFunctionLogicalId: string;
}

/**
 * MCP tool definition for use in serverless config
 */
export interface PikaMcpTool extends PikaToolBase {
    executionType: 'mcp';
    url: string;
    auth?: {
        clientId: string;
        clientSecret: string;
        tokenUrl: string;
        token?: {
            accessToken: string;
            refreshToken?: string;
            expiresAt?: number;
        };
    };
}

/**
 * Inline tool definition for use in serverless config
 */
export interface PikaInlineTool extends PikaToolBase {
    executionType: 'inline';
    code: string;
}

/**
 * Union type for all tool types supported in serverless config
 */
export type PikaToolWithLambdaRef = PikaLambdaToolWithRef | PikaMcpTool | PikaInlineTool;

/**
 * Type guard to check if a tool is a lambda tool
 */
export function isLambdaTool(tool: PikaToolWithLambdaRef): tool is PikaLambdaToolWithRef {
    return tool.executionType === 'lambda';
}

/**
 * Type guard to check if a tool is an MCP tool
 */
export function isMcpTool(tool: PikaToolWithLambdaRef): tool is PikaMcpTool {
    return tool.executionType === 'mcp';
}

/**
 * Type guard to check if a tool is an inline tool
 */
export function isInlineTool(tool: PikaToolWithLambdaRef): tool is PikaInlineTool {
    return tool.executionType === 'inline';
}

/**
 * New Pika configuration format for custom.pika section
 */
export interface PikaServerlessConfig {
    // Custom resource ARNs
    agentCustomResourceArn?: string;
    chatAppCustomResourceArn?: string;
    semanticDirectiveCustomResourceArn?: string;

    // Agent definitions
    agents?: AgentDefinitionWithToolRefs[];

    // Chat app definitions
    chatApps?: ChatAppDataRequest[];

    // Semantic directive definitions
    semanticDirectives?: SemanticDirectiveDataRequest[];

    // Standalone tool definitions (for tools that may be used by external agents)
    tools?: PikaToolWithLambdaRef[];
}

/**
 * Type guard to check if a tool definition is a lambda tool
 */
export function isLambdaToolDefinition(tool: ToolDefinitionForIdempotentCreateOrUpdate): tool is Extract<ToolDefinitionForIdempotentCreateOrUpdate, { executionType: 'lambda' }> {
    return tool.executionType === 'lambda';
}

/**
 * Type guard to check if a tool definition is an MCP tool
 */
export function isMcpToolDefinition(tool: ToolDefinitionForIdempotentCreateOrUpdate): tool is Extract<ToolDefinitionForIdempotentCreateOrUpdate, { executionType: 'mcp' }> {
    return tool.executionType === 'mcp';
}

/**
 * Type guard to check if a tool definition is an inline tool
 */
export function isInlineToolDefinition(tool: ToolDefinitionForIdempotentCreateOrUpdate): tool is Extract<ToolDefinitionForIdempotentCreateOrUpdate, { executionType: 'inline' }> {
    return tool.executionType === 'inline';
}

export interface AgentDefinitionWithToolRefs extends Omit<AgentDataRequest, 'agent' | 'tools'> {
    agent: AgentDefinitionForIdempotentCreateOrUpdate;
    tools?: PikaToolWithLambdaRef[];
}

// /**
//  * Serverless Framework types
//  */
// export interface ServerlessInstance  extends Serverless {
//     service: {
//         service: string;
//         provider: {
//             name: string;
//             stage: string;
//             region: string;
//             compiledCloudFormationTemplate: {
//                 Resources: { [key: string]: any };
//                 Outputs?: { [key: string]: any };
//             };
//         };
//         functions: { [key: string]: PikaFunction };
//         custom?: {
//             pika?: PikaServerlessConfig;
//             [key: string]: any;
//         };
//         resources?: {
//             Resources?: { [key: string]: any };
//         };
//     };
//     cli: {
//         log: (message: string) => void;
//         consoleLog: (message: string) => void;
//     };
//     configSchemaHandler?: {
//         defineFunctionProperties: (provider: string, properties: any) => void;
//     };
//     providers: {
//         aws: {
//             naming: {
//                 getLambdaLogicalId: (functionName: string) => string;
//                 getNormalizedFunctionName: (functionName: string) => string;
//             };
//         };
//     };
// }

// export interface ServerlessOptions {
//     stage?: string;
//     region?: string;
// }

export interface CloudFormationResource {
    Type: string;
    Properties: { [key: string]: any };
    DependsOn?: string[];
}
