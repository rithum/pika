/**
 * Represents the input event structure passed to a Lambda function by an Amazon Bedrock Agent Action Group.
 */
export interface BedrockActionGroupLambdaEvent {
    /** The version of the message format. Currently only "1.0" is supported by Amazon Bedrock. */
    messageVersion: string;

    /** Information about the Bedrock agent invoking the action group. */
    agent: {
        /** The name of the agent. */
        name: string;
        /** The unique identifier of the agent. */
        id: string;
        /** The alias used to invoke the agent. */
        alias: string;
        /** The version of the agent. */
        version: string;
    };

    /** The user input message for the current conversation turn. */
    inputText: string;

    /** The unique identifier for the session with the agent. */
    sessionId: string;

    /** The name of the action group. */
    actionGroup: string;

    /**
     * Present only when the action group is defined using function details.
     * The name of the function to call.
     *
     * Note an action group may only define 11 operations (functions) at the
     * time of this writing.
     */
    function?: string;

    /**
     * A list of input parameters provided to the function or API call.
     * These are derived from the OpenAPI schema or the function definition.
     */
    parameters: Array<{
        /** The name of the parameter. */
        name: string;
        /** The type of the parameter (e.g., string, number). */
        type: string;
        /** The value of the parameter. */
        value: any;
    }>;

    /**
     * Present only when the action group is defined using an OpenAPI schema.
     * The HTTP method (e.g., GET, POST) of the API operation.
     */
    httpMethod?: string;

    /**
     * Present only when the action group is defined using an OpenAPI schema.
     * The path to the API operation.
     */
    apiPath?: string;

    /**
     * Present only when the action group is defined using an OpenAPI schema.
     * The request body defined in the OpenAPI schema for the action group.
     */
    requestBody?: Record<string, any>;

    /**
     * Session attributes that persist for the duration of the session and provide context to the agent.
     * Each time you return these, it updates the session attributes for the current session.
     */
    sessionAttributes?: Record<string, any>;

    /**
     * Prompt session attributes that persist for a single turn and provide short-term context to the agent.
     * Each time you return these, it updates the prompt context for the current session.
     *
     * Attributes that persist over a single turn (one InvokeAgent call). You can use the
     * $prompt_session_attributes$ placeholder when you edit the orchestration base prompt template.
     * This placeholder will be populated at runtime with the attributes that you specify in the promptSessionAttributes field.
     *
     * https://docs.aws.amazon.com/bedrock/latest/userguide/agents-session-state.html#session-state-attributes
     */
    promptSessionAttributes?: Record<string, any>;
}

/**
 * Represents the response structure returned from a Lambda function to an Amazon Bedrock Agent Action Group.
 *
 * The maximum Lambda payload response size is 25 KB.
 *
 * https://docs.aws.amazon.com/bedrock/latest/userguide/agents-lambda.html#agents-lambda-response
 */
export interface BedrockActionGroupLambdaResponse {
    /** The version of the message format. Currently only "1.0" is supported by Amazon Bedrock. */
    messageVersion: string;

    /** Contains the response information from the action group execution. */
    response: ApiSchemaResponse | FunctionResponse;

    /**
     * Optional. Session attributes that persist for the duration of the session and provide context to the agent.
     * These attributes can be modified and returned to update the session state.
     */
    sessionAttributes?: Record<string, any>;

    /**
     * Optional. Prompt session attributes that persist for a single turn and provide short-term context to the agent.
     * These attributes can be modified and returned to update the prompt context.
     */
    promptSessionAttributes?: Record<string, any>;

    /**
     * Optional. Contains a list of query configurations for knowledge bases attached to the agent.
     */
    knowledgeBasesConfiguration?: Array<{
        /** The ID of the knowledge base to configure. */
        knowledgeBaseId: string;
        /** Configuration for the knowledge base retrieval. */
        retrievalConfiguration: {
            /** Configuration for vector search. */
            vectorSearchConfiguration: {
                /** Number of results to return from the knowledge base. */
                numberOfResults?: number;
                /** Optional override for the search type. */
                overrideSearchType?: 'HYBRID' | 'SEMANTIC';
                /** Optional filter for retrieval. */
                filter?: Record<string, any>;
            };
        };
    }>;
}

/**
 * Response structure for action groups defined with an OpenAPI schema.
 */
export interface ApiSchemaResponse {
    /** The name of the action group. */
    actionGroup: string;
    /** The path to the API operation, as defined in the OpenAPI schema. */
    apiPath: string;
    /** The method of the API operation, as defined in the OpenAPI schema. */
    httpMethod: string;
    /** The HTTP status code returned from the API operation. */
    httpStatusCode: number;
    /** Contains the response body, as defined in the OpenAPI schema. */
    responseBody: {
        /** The key is the content type (e.g., 'application/json') */
        [contentType: string]: {
            /** The response body content as a JSON-formatted string. */
            body: string;
        };
    };
}

/**
 * Response structure for action groups defined with function details.
 */
export interface FunctionResponse {
    /** The name of the action group. */
    actionGroup: string;
    /** The name of the function as defined in the function details. */
    function: string;
    /** Contains details about the function execution response. */
    functionResponse: {
        /**
         * Optional. Set to one of the following states to define the agent's behavior after processing:
         * - FAILURE: The agent throws a DependencyFailedException for the current session.
         *            Applies when the function execution fails because of a dependency failure.
         * - REPROMPT: The agent passes a response string to the model to reprompt it.
         *             Applies when the function execution fails because of invalid input.
         */
        responseState?: 'FAILURE' | 'REPROMPT';
        /** Contains the response from execution of the function. */
        responseBody: {
            /** The key is the content type (currently only 'TEXT' is supported) */
            [functionContentType: string]: {
                /** The response body content as a JSON-formatted string. */
                body: string;
            };
        };
    };
}

/**
 *  Note: each description below should be just detailed enough to achieve the desired goal of the description attribute.
 *
 *  Even though parameters isn't required, always set to `{}` if no parameters needed for the function.
 *
 *  Explicitly include requireConfirmation even though not required and set to false
 */
export interface BedrockActionGroupFunctionSchema {
    // A name for the function, use snake case.  Here's the regex pattern allowed: ^([0-9a-zA-Z][_-]?){1,100}$
    name: string;

    // Describe the purpose of the function such that an LLM will know when to use this function.
    // Details necessary to call the function.  Details about the result returned from the function.
    // If the function returns multi-page data, explain how to page through the data.  If there are
    // combinations of dependent parameters for different purposes, explain them.
    // Max 1200 characters in length.
    description: string;

    // Function parameters.  The string key is the name of the parameter which must conform to ^([0-9a-zA-Z][_-]?){1,100}$
    parameters?: Record<string, BedrockActionGroupFunctionSchemaParameterDetail>;

    // Contains information if user confirmation is required to invoke the function.
    requireConfirmation?: 'ENABLED' | 'DISABLED';
}

export interface BedrockActionGroupFunctionSchemaParameterDetail {
    // Whether the parameter is required or not.  Even though not required, you should always include this to be explicit.
    required?: boolean;

    // The type of the parameter.
    type: 'string' | 'integer' | 'array' | 'number' | 'boolean';

    // A description of the parameter. Helps the foundation model determine how to elicit the parameters from the user.
    // Maximum length of 500 characters.
    description?: string;
}

/**
 * Note only took time to define the OrchestrationTrace object.  All of them are defined in:
 *
 * https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_Trace.html
 */
export type Trace =
    | CustomOrchestrationTrace
    | FailureTrace
    | GuardRailTrace
    | PreProcessingTrace
    | PostProcessingTrace
    | RoutingClassifierTrace;

export type CustomOrchestrationTrace = Record<string, unknown>;
export type FailureTrace = Record<string, unknown>;
export type GuardRailTrace = Record<string, unknown>;
export type PreProcessingTrace = Record<string, unknown>;
export type PostProcessingTrace = Record<string, unknown>;
export type RoutingClassifierTrace = Record<string, unknown>;

/**
 * Represents the OrchestrationTrace object from the AWS Bedrock Agent Runtime.
 * It contains details about the orchestration step, in which the agent
 * determines the order in which actions are executed and which knowledge bases
 * are retrieved.
 *
 * This data type is a UNION, so only one of the following members can be specified when used or returned.
 *
 * Based on: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_OrchestrationTrace.html
 */
export interface OrchestrationTrace {
    /**
     * Contains information pertaining to the action group or knowledge base
     * that is being invoked.
     */
    invocationInput?: InvocationInput;

    /**
     * The input for the orchestration step.
     * The type is ORCHESTRATION. The text contains the prompt.
     * The inferenceConfiguration, parserMode, and overrideLambda values are set
     * in the PromptOverrideConfiguration object that was set when the agent
     * was created or updated.
     */
    modelInvocationInput?: ModelInvocationInput;

    /**
     * Contains information pertaining to the output from the foundation model
     * that is being invoked.
     */
    modelInvocationOutput?: OrchestrationModelInvocationOutput;

    /**
     * Details about the observation (the output of the action group Lambda or knowledge base)
     * made by the agent.
     */
    observation?: Observation;

    /**
     * Details about the reasoning, based on the input, that the agent uses to
     * justify carrying out an action group or getting information from a knowledge base.
     */
    rationale?: Rationale;
}

/**
 * Represents the reasoning, based on the input, that the agent uses to justify carrying out an action group or retrieving information from a knowledge base.
 */
export type Rationale = {
    /**
     * The reasoning or thought process of the agent, based on the input.
     *
     * Type: string
     * Required: No
     */
    text?: string;

    /**
     * The unique identifier of the trace step.
     *
     * Type: string
     * Length Constraints: Minimum length of 2. Maximum length of 16.
     * Required: No
     */
    traceId?: string;
};

/**
 * Contains the result or output of an action group or knowledge base, or the response to the user.
 */
export type Observation = {
    /**
     * Contains the JSON-formatted string returned by the API invoked by the action group.
     * Type: ActionGroupInvocationOutput object
     * Required: No
     */
    actionGroupInvocationOutput?: ActionGroupInvocationOutput;

    /**
     * A collaborator's invocation output.
     * Type: AgentCollaboratorInvocationOutput object
     * Required: No
     */
    agentCollaboratorInvocationOutput?: AgentCollaboratorInvocationOutput;

    /**
     * Contains the JSON-formatted string returned by the API invoked by the code interpreter.
     * Type: CodeInterpreterInvocationOutput object
     * Required: No
     */
    codeInterpreterInvocationOutput?: CodeInterpreterInvocationOutput;

    /**
     * Contains details about the response to the user.
     * Type: FinalResponse object
     * Required: No
     */
    finalResponse?: FinalResponse;

    /**
     * Contains details about the results from looking up the knowledge base.
     * Type: KnowledgeBaseLookupOutput object
     * Required: No
     */
    knowledgeBaseLookupOutput?: KnowledgeBaseLookupOutput;

    /**
     * Contains details about the response to reprompt the input.
     * Type: RepromptResponse object
     * Required: No
     */
    repromptResponse?: RepromptResponse;

    /**
     * The unique identifier of the trace.
     * Type: String
     * Length Constraints: Minimum length of 2. Maximum length of 16.
     * Required: No
     */
    traceId?: string;

    /**
     * Specifies what kind of information the agent returns in the observation.
     * Valid Values: ACTION_GROUP | AGENT_COLLABORATOR | KNOWLEDGE_BASE | FINISH | ASK_USER | REPROMPT
     * Type: String
     * Required: No
     */
    type?:
        | 'ACTION_GROUP'
        | 'AGENT_COLLABORATOR'
        | 'KNOWLEDGE_BASE'
        | 'FINISH'
        | 'ASK_USER'
        | 'REPROMPT';
};

/**
 * Contains details about the agent's response to reprompt the input.
 */
export type RepromptResponse = {
    /**
     * Specifies what output is prompting the agent to reprompt the input.
     *
     * Valid values:
     * - 'ACTION_GROUP'
     * - 'KNOWLEDGE_BASE'
     * - 'PARSER'
     *
     * Type: string
     * Required: No
     */
    source?: 'ACTION_GROUP' | 'KNOWLEDGE_BASE' | 'PARSER';

    /**
     * The text reprompting the input.
     *
     * Type: string
     * Required: No
     */
    text?: string;
};

export interface ActionGroupInvocationOutput {
    /**
     * Contains the JSON-formatted string returned by the API invoked by the action group.
     */
    text?: string;
}

/** Output from an agent collaborator. */
export interface AgentCollaboratorInvocationOutput {
    /** The output's agent collaborator alias ARN. */
    agentCollaboratorAliasArn?: string;
    /** The output's agent collaborator name. */
    agentCollaboratorName?: string;
    /** The output's output.  */
    output?: string;
}

/**
 * Represents the output returned by the code interpreter after executing code.
 */
export type CodeInterpreterInvocationOutput = {
    /**
     * Contains the error message returned from code execution, if any.
     *
     * Type: string
     * Required: No
     */
    executionError?: string;

    /**
     * Contains the successful output returned from code execution.
     *
     * Type: string
     * Required: No
     */
    executionOutput?: string;

    /**
     * Indicates if the execution of the code timed out.
     *
     * Type: boolean
     * Required: No
     */
    executionTimeout?: boolean;

    /**
     * Contains output files, if generated by code execution.
     *
     * Type: Array of strings
     * Required: No
     */
    files?: string[];
};

/** Contains details about the response to the user. */
export interface FinalResponse {
    /**
     * The text in the response to the user.
     */
    text?: string;
}

// Represents the output from the foundation model during the orchestration step
export interface OrchestrationModelInvocationOutput {
    /**
     * Information about the foundation model output from the orchestration step.
     */
    metadata?: Metadata;

    /**
     * Details of the raw response from the foundation model output.
     */
    rawResponse?: RawResponse;

    /**
     * Content about the reasoning that the model made during the orchestration step.
     * Note: This is a union type; only one member can be specified or returned.
     */
    reasoningContent?: ReasoningContentBlock;

    /**
     * The unique identifier of the trace.
     */
    traceId?: string; // Constraints: Minimum length of 2. Maximum length of 16.
}

/** Contains details about the results from looking up the knowledge base. */
export interface KnowledgeBaseLookupOutput {
    /** Contains metadata about the sources cited for the generated response. */
    retrievedReferences?: RetrievedReference[];
}

/** Contains metadata about a source cited for the generated response. */
export interface RetrievedReference {
    /** Contains the cited text from the data source. */
    content?: RetrievalResultContent;

    /** Contains information about the location of the data source. */
    location?: RetrievalResultLocation;

    /**
     * Contains metadata attributes and their values for the file in the data source. For more information, see Metadata and filtering.
     * Type: String to JSON value map
     * Map Entries: Maximum number of items.
     * Key Length Constraints: Minimum length of 1. Maximum length of 100.
     */
    metadata?: string;
}

/**
 * Contains information about a chunk of text from a data source in the knowledge base. If the result is
 * from a structured data source, the cell in the database and the type of the value is also identified.
 */
export interface RetrievalResultContent {
    /**
     * A data URI with base64-encoded content from the data source. The URI is in the following format:
     *  returned in the following format: data:image/jpeg;base64,${base64-encoded string}.
     */
    byteContent?: string;

    /** Specifies information about the rows with the cells to return in retrieval. */
    row?: RetrievalResultContentColumn;

    /** The cited text from the data source. */
    text?: string;

    /** The type of content in the retrieval result. */
    type: 'TEXT' | 'IMAGE' | 'ROW';
}

/** Contains information about a column with a cell to return in retrieval. */
export interface RetrievalResultContentColumn {
    /**
     * The name of the column.
     */
    columnName?: string;

    /** Te value in the column. */
    columnValue?: string;

    /** The data type of the value. */
    type: 'BLOB' | 'BOOLEAN' | 'DOUBLE' | 'NULL' | 'LONG' | 'STRING';
}

/**
 * Not defining this.  YOu find it here
 * https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_RetrievalResultLocation.html
 */
export type RetrievalResultLocation = Record<string, unknown>;

/**
 * Provides details of the foundation model.
 */
export interface Metadata {
    /**
     * Contains details of the foundation model usage.
     */
    usage?: Usage;
}

/**
 * Provides details of the foundation model usage.
 */
export interface Usage {
    /**
     * The number of tokens in the input.
     */
    inputTokens?: number;

    /**
     * The number of tokens in the output.
     */
    outputTokens?: number;
}

/**
 * Contains the raw output from the foundation model.
 */
export interface RawResponse {
    /** The foundation model's raw output content. */
    content?: string;
}

/**
 * Contains content regarding the reasoning that the foundation model made with respect to the content in the content block.
 * Reasoning refers to a Chain of Thought (CoT) that the model generates to enhance the accuracy of its final response.
 *
 * This data type is a UNION, so only one of the following members can be specified when used or returned.
 */
export interface ReasoningContentBlock {
    /** Contains information about the reasoning that the model used to return the content in the content block. */
    reasoningText?: ReasoningTextBlock;
    /**
     * The content in the reasoning that was encrypted by the model provider for trust and safety reasons.
     *
     * Base64-encoded binary data object
     */
    redactedContent?: string;
}

/**
 * Contains information about the reasoning that the model used to return the content in the content block.
 */
export interface ReasoningTextBlock {
    /**
     * Text describing the reasoning that the model used to return the content in the content block.
     */
    text: string;

    /**
     * A hash of all the messages in the conversation to ensure that the content in the reasoning
     * text block isn't tampered with. You must submit the signature in subsequent Converse requests,
     * in addition to the previous messages. If the previous messages are tampered with, the response
     * throws an error.
     */
    signature?: string;
}

/**
 * Represents the ReasoningContentBlock object from the AWS Bedrock Agent Runtime.
/**
 * Represents the InvocationInput object from the AWS Bedrock Agent Runtime.
 * Contains information pertaining to the action group or knowledge base that is being invoked.
 *
 * Based on: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_InvocationInput.html
 */
export interface InvocationInput {
    /**
     * Contains information about the action group to be invoked.
     */
    actionGroupInvocationInput?: ActionGroupInvocationInput;

    /**
     * The collaborator's invocation input.
     */
    agentCollaboratorInvocationInput?: AgentCollaboratorInvocationInput;

    /**
     * Contains information about the code interpreter to be invoked.
     */
    codeInterpreterInvocationInput?: CodeInterpreterInvocationInput;

    /**
     * Specifies whether the agent is invoking an action group or a knowledge base.
     * Valid values: 'ACTION_GROUP' | 'KNOWLEDGE_BASE' | 'FINISH' | 'ACTION_GROUP_CODE_INTERPRETER' | 'AGENT_COLLABORATOR'
     */
    invocationType?:
        | 'ACTION_GROUP'
        | 'KNOWLEDGE_BASE'
        | 'FINISH'
        | 'ACTION_GROUP_CODE_INTERPRETER'
        | 'AGENT_COLLABORATOR';

    /**
     * Contains details about the knowledge base to look up and the query to be made.
     */
    knowledgeBaseLookupInput?: KnowledgeBaseLookupInput;

    /**
     * The unique identifier of the trace.
     * Length Constraints: Minimum length of 2. Maximum length of 16.
     */
    traceId?: string;
}

/**
 * Represents the KnowledgeBaseLookupInput object from the AWS Bedrock Agent Runtime.
 * Contains details about the knowledge base to look up and the query to be made.
 *
 * Based on: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_KnowledgeBaseLookupInput.html
 */
export interface KnowledgeBaseLookupInput {
    /**
     * The unique identifier of the knowledge base to look up.
     */
    knowledgeBaseId?: string;

    /**
     * The query made to the knowledge base.
     */
    text?: string;
}

/**
 * Represents the CodeInterpreterInvocationInput object from the AWS Bedrock Agent Runtime.
 * Contains information about the code interpreter being invoked.
 *
 * Based on: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_CodeInterpreterInvocationInput.html
 */
export interface CodeInterpreterInvocationInput {
    /**
     * The code for the code interpreter to use.
     */
    code?: string;

    /**
     * Files that are uploaded for the code interpreter to use.
     */
    files?: string[];
}

/**
 * Represents the AgentCollaboratorInvocationInput object from the AWS Bedrock Agent Runtime.
 * Contains information about the agent collaborator being invoked.
 *
 * Based on: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_AgentCollaboratorInvocationInput.html
 */
export interface AgentCollaboratorInvocationInput {
    /**
     * The collaborator's alias ARN.
     * Pattern: ^arn:aws(-[^:]+)?:bedrock:[a-z0-9-]{1,20}:[0-9]{12}:agent-alias/[0-9a-zA-Z]{10}/[0-9a-zA-Z]{10}$
     */
    agentCollaboratorAliasArn?: string;

    /**
     * The collaborator's name.
     */
    agentCollaboratorName?: string;

    /**
     * Text or action invocation result input for the collaborator.
     */
    input?: AgentCollaboratorInputPayload;
}

/**
 * Represents the input payload for an agent collaborator in the AWS Bedrock Agent Runtime.
 * The input can be either plain text or an action invocation result.
 */
export interface AgentCollaboratorInputPayload {
    /**
     * An action invocation result.
     */
    returnControlResults?: ReturnControlResults;

    /**
     * Input text.
     */
    text?: string;

    /**
     * The input type.
     * Valid values: 'TEXT' | 'RETURN_CONTROL'
     */
    type?: 'TEXT' | 'RETURN_CONTROL';
}

/**
 * Represents the result of returning control to the agent developer.
 */
export interface ReturnControlResults {
    /**
     * The action's invocation ID.
     */
    invocationId?: string;

    /**
     * The action invocation result.
     * Minimum items: 1
     * Maximum items: 5
     */
    returnControlInvocationResults?: InvocationResultMember[];
}

/**
 * Represents a single invocation result member.
 */
export interface InvocationResultMember {
    /**
     * The function result.
     */
    functionResult?: FunctionResult;

    /**
     * The API result.
     */
    apiResult?: ApiResult;
}

/**
 * Represents the result of a function invocation.
 */
export interface FunctionResult {
    /**
     * The name of the action group.
     */
    actionGroup?: string;

    /**
     * The name of the function.
     */
    function?: string;

    /**
     * The response body from the function invocation.
     * The keys are content types (e.g., 'TEXT'), and the values are response content.
     */
    responseBody?: Record<string, ResponseContent>;
}

/**
 * Represents the result of an API invocation.
 */
export interface ApiResult {
    /**
     * The name of the action group.
     */
    actionGroup?: string;

    /**
     * The HTTP method used in the API invocation.
     */
    httpMethod?: string;

    /**
     * The API path invoked.
     */
    apiPath?: string;

    /**
     * The response body from the API invocation.
     * The keys are content types (e.g., 'application/json'), and the values are response content.
     */
    responseBody?: Record<string, ResponseContent>;
}

/**
 * Represents the content of a response.
 */
export interface ResponseContent {
    /**
     * The body of the response.
     */
    body?: string;
}

/**
 * Represents the ActionGroupInvocationInput object from the AWS Bedrock Agent Runtime.
 * Contains information about the action group being invoked.
 *
 * Based on: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_ActionGroupInvocationInput.html
 */
export interface ActionGroupInvocationInput {
    /**
     * The name of the action group.
     */
    actionGroupName?: string;

    /**
     * The path to the API to call, based off the action group.
     */
    apiPath?: string;

    /**
     * How fulfillment of the action is handled.
     * Valid values: 'LAMBDA' | 'RETURN_CONTROL'
     */
    executionType?: 'LAMBDA' | 'RETURN_CONTROL';

    /**
     * The function in the action group to call.
     */
    function?: string;

    /**
     * The unique identifier of the invocation.
     * Only returned if the executionType is RETURN_CONTROL.
     */
    invocationId?: string;

    /**
     * The parameters in the Lambda input event.
     */
    parameters?: Parameter[];

    /**
     * The parameters in the request body for the Lambda input event.
     */
    requestBody?: RequestBody;

    /**
     * The API method being used, based off the action group.
     */
    verb?: string;
}

/**
 * Represents a parameter in the Lambda input event.
 */
export interface Parameter {
    /**
     * The name of the parameter.
     */
    name: string;

    /**
     * The type of the parameter.
     */
    type: string;

    /**
     * The value of the parameter.
     */
    value: string;
}

/**
 * Represents the request body for the Lambda input event.
 */
export interface RequestBody {
    /**
     * A map of content types to their respective parameters.
     */
    content: Record<string, Parameter[]>;
}

/**
 * ModelInvocationInput
 * --------------------
 * The prompt + model-level settings the agent sends to the foundation model
 * during a given step (pre-processing, orchestration, KB-response-gen, etc.).
 *
 * Docs: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_ModelInvocationInput.html
 */
export interface ModelInvocationInput {
    /** ARN or name of the model (custom or FM). */
    foundationModel?: string;

    /** Temperature, top-p, max-tokens, stop sequences, … */
    inferenceConfiguration?: InferenceConfiguration;

    /** ARN of a Lambda that post-parses the raw FM output (optional override). */
    overrideLambda?: string;

    /** Whether the default parser Lambda is used. */
    parserMode?: 'DEFAULT' | 'OVERRIDDEN';

    /** Whether the default prompt template was overridden. */
    promptCreationMode?: 'DEFAULT' | 'OVERRIDDEN';

    /** The actual prompt text that was sent to the model. */
    text?: string;

    /** Unique ID that ties this record to the overall trace. */
    traceId?: string;

    /** Which step of the agent sequence this relates to. */
    type?:
        | 'PRE_PROCESSING'
        | 'ORCHESTRATION'
        | 'KNOWLEDGE_BASE_RESPONSE_GENERATION'
        | 'POST_PROCESSING'
        | 'ROUTING_CLASSIFIER';
}

/* -------------------------------------------------------------------------- */
/* Nested types                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A light version of the InferenceConfiguration object.
 * Only the fields documented under ModelInvocationInput are included here;
 * add any others you need.
 *
 * Docs: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_agent-runtime_InferenceConfiguration.html
 */
export interface InferenceConfiguration {
    maximumLength?: number; // 0 – 8192
    stopSequences?: string[]; // 0 – 4 items
    temperature?: number; // 0 – 1
    topK?: number; // 0 – 500
    topP?: number; // 0 – 1
}