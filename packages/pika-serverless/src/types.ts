import {
    AgentDataRequest,
    AgentDefinitionForIdempotentCreateOrUpdate,
    ChatAppDataRequest,
    ToolDefinitionForIdempotentCreateOrUpdate,
    SemanticDirectiveDataRequest,
    SemanticDirectiveForCreateOrUpdate
} from 'pika-shared/types/chatbot/chatbot-types';
import Serverless from 'serverless';

/**
 * Tool definition that references a lambda function by its logical ID
 */
export interface PikaToolWithLambdaRef extends Omit<ToolDefinitionForIdempotentCreateOrUpdate, 'lambdaArn'> {
    /**
     * The logical ID of the lambda function that backs this tool
     * This should match a function name defined in the functions section
     */
    lambdaFunctionLogicalId: string;
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
