import {
    type ActionGroupInvocationInput,
    type AgentActionGroup,
    AgentCollaboration,
    type Attribution,
    BedrockAgentRuntimeClient,
    type Collaborator,
    type ConversationHistory,
    CreationMode,
    CustomControlMethod,
    type InlineAgentReturnControlPayload,
    InvocationInputMember,
    InvokeInlineAgentCommand,
    type InvokeInlineAgentCommandInput,
    type KnowledgeBase,
    PromptState,
    PromptType,
    RelayConversationHistory,
    ResponseState,
    type RetrievalFilter,
    type Trace
} from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { existsSync, readFileSync } from 'fs';
import cloneDeep from 'lodash.clonedeep';
import { resolve } from 'path';
import {
    Accurate,
    AccurateWithStatedAssumptions,
    AccurateWithUnstatedAssumptions,
    type AgentAndTools,
    type KnowledgeBase as AgentDefinitionKnowledgeBase,
    type ChatAppOverridableFeaturesForConverseFn,
    type ChatMessageForCreate,
    type ChatMessageUsage,
    type ChatSession,
    Inaccurate,
    type InlineToolDefinition,
    type McpToolDefinition,
    type RecordOrUndef,
    type SemanticDirective,
    type SimpleAuthenticatedUser,
    type ToolDefinition,
    Unclassified,
    type UserMemoryFeatureWithMemoryInfo,
    type VerifyResponseClassification,
    VerifyResponseClassifications
} from 'pika-shared/types/chatbot/chatbot-types';
import type { EnhancedResponseStream } from '../lambda/converse/EnhancedResponseStream';
import { modelPricing } from '../lambda/converse/model-pricing';
import { jsonparse } from './jsonparse';
import { processMcpActionGroup as processMcpTool } from './mcp';
import { buildTypedMemoryContents, createTypedMemoryEvent } from './memory';
import {
    DEFAULT_ANTHROPIC_MODEL,
    DEFAULT_ANTHROPIC_VERSION,
    DEFAULT_VERIFICATION_MODEL,
    type InvokeAgentHooks,
    type ReturnControlContext,
    type ToolContext
} from './model-types-utils';
import { parsers } from './tool-input-parser';
import { convertDatesToStrings, getRegion, sanitizeAndStringifyError } from './utils';

const bedrockAgentClient = new BedrockAgentRuntimeClient({ region: getRegion() });
const bedrockClient = new BedrockRuntimeClient({ region: getRegion() });

// This is a map of toolId to local endpoint
let localActionGroupEndpoints: Record<string, string> = {};
if (process.env.LOCAL_TOOLS != null) {
    try {
        // Read the local action group endpoints from the file
        let path = resolve(process.cwd(), process.env.LOCAL_TOOLS);
        if (existsSync(path)) {
            localActionGroupEndpoints = JSON.parse(readFileSync(path, 'utf8'));
            console.log('Local action group endpoints:', localActionGroupEndpoints);
        } else {
            console.error('Error reading custom-local-action-group-endpoints.json:', path);
        }
    } catch (e) {
        console.error('Error reading custom-local-action-group-endpoints.json:', e);
    }
}

if (global.awslambda?.HttpResponseStream?.from == null) {
    console.log('DEBUG: Setting up HttpResponseStream because it is missing');
    global.awslambda = {
        ...global.awslambda, // Keep any existing setup from lambda-stream
        streamifyResponse: (handler) => {
            //handler = streamifyResponseOrig(handler);
            return (event: any, context: any) => handler(event, context.responseStream, context);
        },
        HttpResponseStream: class HttpResponseStream {
            static from(underlyingStream: any, prelude: any) {
                let set = (key: any, value: any) => {};
                if (underlyingStream.set) {
                    set = underlyingStream.set.bind(underlyingStream);
                } else if (underlyingStream.headers) {
                    set = underlyingStream.headers.set.bind(underlyingStream.headers);
                }
                Object.entries(prelude.headers).forEach(([key, value]) => {
                    set(key, value);
                });
                //underlyingStream.setContentType(METADATA_PRELUDE_CONTENT_TYPE)
                // const metadataPrelude = JSON.stringify(prelude)
                // underlyingStream._onBeforeFirstWrite = (write) => {
                // 	write(metadataPrelude)
                // 	write(new Uint8Array(DELIMITER_LEN))
                // }
                return underlyingStream;
            }
        } as any
    };
} else {
    console.log('DEBUG: HttpResponseStream.from already exists, skipping setup');
}

console.log('DEBUG: global.awslambda after setup:', {
    exists: !!global.awslambda,
    HttpResponseStream: global.awslambda?.HttpResponseStream,
    hasFrom: !!global.awslambda?.HttpResponseStream?.from,
    keys: global.awslambda ? Object.keys(global.awslambda) : null
});

export function getBedrockAgentClient(): BedrockAgentRuntimeClient {
    return bedrockAgentClient;
}

export function getBedrockClient(): BedrockRuntimeClient {
    return bedrockClient;
}

async function invokeAgent(cmdInput: InvokeInlineAgentCommandInput, hooks: InvokeAgentHooks, label: string, appliedDirectives?: SemanticDirective[]) {
    let error: unknown;
    let startingTime = Date.now();
    let model: string = cmdInput.foundationModel ?? DEFAULT_ANTHROPIC_MODEL;

    let lastModelInvocationOutputTraceContent:
        | {
              content: {
                  traceId?: string;
                  input?: unknown;
                  text: string;
                  type?: string;
                  name?: string;
              }[];
              traceId: string;
          }
        | undefined;
    let responseMsg = '';
    let usage: ChatMessageUsage = {
        inputTokens: 0,
        outputTokens: 0,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0
    };
    let traces: Trace[] = [];

    console.log(label, 'Command input built successfully');
    console.log(label, 'InvokeInlineAgentCommandInput:', JSON.stringify(cmdInput, null, 2));

    try {
        console.log(label, 'Creating InvokeInlineAgentCommand...');
        const cmd = new InvokeInlineAgentCommand(cmdInput);
        console.log(label, 'InvokeInlineAgentCommand created');
        console.log(label, 'InvokeInlineAgentCommand:', JSON.stringify(cmd, null, 2));

        console.log(label, 'Sending command to Bedrock Agent Runtime...');
        let response = await bedrockAgentClient.send(cmd);
        console.log(label, 'Bedrock Agent Runtime response received');
        console.log(label, 'InvokeInlineAgentCommandResponse', response);

        if (response.completion === undefined) {
            console.error(label, 'No completion found in response');
            throw new Error('No completion found in response');
        }

        hooks.onStart();

        // Add semantic directives trace for debugging (admin only on frontend)
        // Send early so it appears at the top of the reasoning
        if (appliedDirectives && appliedDirectives.length > 0) {
            hooks.onTrace({
                orchestrationTrace: {
                    rationale: {
                        traceId: 'semantic-directives',
                        text: JSON.stringify({
                            type: 'semantic-directives',
                            directives: appliedDirectives.map((d) => ({
                                scope: d.scope,
                                id: d.id,
                                description: d.description,
                                instructions: d.instructions
                            }))
                        })
                    }
                }
            });
        }

        console.log(label, 'Processing completion stream...');
        let chunkCount = 0;

        while (response.completion) {
            let returnControl: InlineAgentReturnControlPayload | undefined;
            for await (const chunk of response.completion) {
                chunkCount++;
                console.log(label, `Processing chunk ${chunkCount}:`, {
                    hasChunkBytes: !!chunk.chunk?.bytes,
                    hasTrace: !!chunk.trace?.trace,
                    chunkBytesLength: chunk.chunk?.bytes?.length
                });

                if (chunk.chunk?.bytes) {
                    const decodedChunk = new TextDecoder().decode(chunk.chunk.bytes);
                    console.log(label, `Chunk ${chunkCount} decoded:`, {
                        length: decodedChunk.length,
                        preview: decodedChunk.substring(0, 100)
                    });
                    responseMsg += decodedChunk;

                    hooks.onChunk(decodedChunk, chunkCount, chunk.chunk.attribution);
                    console.log(label, `Chunk ${chunkCount} written to response stream`);
                }

                if (chunk.trace?.trace) {
                    const trace = chunk.trace.trace as Trace;
                    console.log(label, `Processing trace for chunk ${chunkCount}`);
                    console.log(label, `Trace:`, JSON.stringify(trace, null, 2));

                    /*
                       The trace variable in the case of an error will have this and not trace.orchestrationTrace and the
                       check below detects it's not there and skips it.  An error results elsewhere and we will get into the 
                       the catch block.
    
                        {
                            "failureTrace": {
                                "failureCode": 400,
                                "failureReason": "Invocation of model ID anthropic.claude-3-5-haiku-20241022-v1:0 with on-demand throughput isn’t supported. Retry your request with the ID or ARN of an inference profile that contains this model.",
                                "metadata": {
                                    "clientRequestId": "6e6f3e88-b9f9-4bcb-b98e-1e3cd0115fad",
                                    "endTime": "2025-05-29T16:15:42.822380245Z",
                                    "operationTotalTimeMs": 92,
                                    "startTime": "2025-05-29T16:15:42.775346536Z",
                                    "totalTimeMs": 47
                                },
                                "traceId": "62c56285-5b5b-45f3-b634-8a3f4db30aca-0"
                            }
                        }
                    */

                    // Add null check for orchestrationTrace
                    if (!trace.orchestrationTrace && !trace.failureTrace) {
                        console.log(label, `Chunk ${chunkCount} trace has no orchestrationTrace, skipping`);
                        continue;
                    }

                    //TODO: check type when done
                    if (
                        // Tool & KB Invocations
                        trace.orchestrationTrace?.invocationInput ||
                        trace.orchestrationTrace?.observation?.actionGroupInvocationOutput ||
                        trace.orchestrationTrace?.observation?.agentCollaboratorInvocationOutput ||
                        trace.orchestrationTrace?.observation?.knowledgeBaseLookupOutput ||
                        // Usage
                        trace.orchestrationTrace?.modelInvocationOutput ||
                        // Thinking & Errors
                        trace.orchestrationTrace?.rationale ||
                        trace.failureTrace
                    ) {
                        const inputTokens = trace.orchestrationTrace?.modelInvocationOutput?.metadata?.usage?.inputTokens ?? 0;
                        const outputTokens = trace.orchestrationTrace?.modelInvocationOutput?.metadata?.usage?.outputTokens ?? 0;

                        usage.inputTokens += inputTokens;
                        usage.outputTokens += outputTokens;

                        console.log(label, `Usage updated from trace:`, {
                            chunkInputTokens: inputTokens,
                            chunkOutputTokens: outputTokens,
                            totalInputTokens: usage.inputTokens,
                            totalOutputTokens: usage.outputTokens
                        });

                        if (trace.orchestrationTrace?.modelInvocationOutput?.rawResponse) {
                            let content = trace.orchestrationTrace.modelInvocationOutput.rawResponse.content!;
                            if (typeof content === 'string' && content.match(/^{.*}$/)) {
                                lastModelInvocationOutputTraceContent = JSON.parse(content);
                            } else {
                                lastModelInvocationOutputTraceContent = {
                                    content: [
                                        {
                                            text: content
                                        }
                                    ],
                                    traceId: ''
                                };
                            }
                            //TODO: check type when done
                            if (trace.orchestrationTrace.modelInvocationOutput.traceId) {
                                lastModelInvocationOutputTraceContent!.traceId = trace.orchestrationTrace.modelInvocationOutput.traceId;
                            } else {
                                throw new Error(`No traceId found in modelInvocationOutput for chunk ${chunkCount} and trace: ${JSON.stringify(trace, null, 2)}`);
                            }
                            // Don't keep the raw response in the trace
                            delete trace.orchestrationTrace?.modelInvocationOutput?.rawResponse;
                        }

                        // Detect if we have been going too long and send a prompt to the user to continue
                        // Only do this for the root agent, not for collaborator agents
                        if (chunk.trace.callerChain?.length == 1 && trace.failureTrace?.failureReason === 'Max iterations exceeded') {
                            hooks.onChunk(`This one is taking me awhile to think.<prompt>Continue</prompt>`, chunkCount);
                        }

                        // // Trim the observation to just a preview.  Observations can be large
                        // let truncateSize = 30000; // TODO: THIS NEEDS TO BE A CONFIGURABLE
                        // if (trace.orchestrationTrace?.observation && (trace.orchestrationTrace.observation.actionGroupInvocationOutput?.text?.length ?? 0) > truncateSize) {
                        //     trace.orchestrationTrace.observation.actionGroupInvocationOutput!.text =
                        //         trace.orchestrationTrace.observation.actionGroupInvocationOutput!.text!.substring(0, truncateSize) + ' ...';
                        // }
                        traces.push(trace);
                        hooks.onTrace(trace);
                    }
                }
                if (chunk.returnControl) {
                    returnControl = chunk.returnControl;
                }
            }

            delete response.completion;
            if (returnControl != null) {
                console.log(label, 'Processing return control:', JSON.stringify(returnControl, null, 2));
                let responses = await Promise.all(
                    returnControl.invocationInputs!.map(async (fnCmd) => {
                        let response;
                        let startTime = new Date();
                        try {
                            let handler = hooks.returnControlHandlers?.[fnCmd.functionInvocationInput!.actionGroup!];
                            if (!handler) {
                                throw new Error(`No return control handler found for action group: ${fnCmd.functionInvocationInput!.actionGroup}`);
                            }

                            // Invoke the local action group endpoint
                            let result = await handler(fnCmd, {
                                sessionId: cmdInput.sessionId!,
                                invokeCommand: cmdInput
                            });

                            // Return the result
                            response = {
                                functionResult: {
                                    actionGroup: fnCmd.functionInvocationInput!.actionGroup,
                                    function: fnCmd.functionInvocationInput!.function,
                                    responseBody: {
                                        TEXT: {
                                            body: typeof result === 'string' ? result : JSON.stringify(result)
                                        }
                                    }
                                }
                            };
                        } catch (error) {
                            // If there is an error, return a reprompt
                            response = {
                                functionResult: {
                                    responseState: ResponseState.REPROMPT,
                                    actionGroup: fnCmd.functionInvocationInput!.actionGroup,
                                    function: fnCmd.functionInvocationInput!.function,
                                    responseBody: {
                                        TEXT: {
                                            body: JSON.stringify(
                                                error,
                                                Object.getOwnPropertyNames(error).filter((f) => f != 'stack')
                                            )
                                        }
                                    }
                                }
                            };
                        }

                        let endTime = new Date();
                        let duration = endTime.getTime() - startTime.getTime();

                        // Manually add the trace for the action group invocation output
                        // The framework doesn't create one because it returned control
                        hooks.onTrace({
                            orchestrationTrace: {
                                observation: {
                                    traceId: lastModelInvocationOutputTraceContent!.traceId,
                                    type: 'ACTION_GROUP',
                                    actionGroupInvocationOutput: {
                                        text: response.functionResult.responseBody.TEXT.body,
                                        metadata: {
                                            totalTimeMs: duration,
                                            startTime: startTime,
                                            endTime: endTime
                                        }
                                    }
                                }
                            }
                        });
                        return response;
                    })
                );

                // Set the return control invocation results
                cmdInput.inlineSessionState!.invocationId = returnControl.invocationId!;
                cmdInput.inlineSessionState!.returnControlInvocationResults = responses;

                // Begin the next invocation with the response from the return control
                let cmd = new InvokeInlineAgentCommand({
                    ...cmdInput
                });
                response = await bedrockAgentClient.send(cmd);
            }
        }
        console.log(label, 'Completion stream processing finished:', {
            totalChunks: chunkCount,
            responseLength: responseMsg.length,
            tracesCount: traces.length
        });
    } catch (e) {
        // If there is a hard error when trying to invoke a tool the event with the invocation details doesn't get emitted
        // but we have the raw model output so we can parse recreate what the invocation event would be
        if (lastModelInvocationOutputTraceContent && Array.isArray(lastModelInvocationOutputTraceContent.content)) {
            try {
                let len = lastModelInvocationOutputTraceContent.content.length;
                if (!traces[0]?.orchestrationTrace?.invocationInput && lastModelInvocationOutputTraceContent.content[len - 1]?.type == 'tool_use') {
                    let lastRawTrace = lastModelInvocationOutputTraceContent.content[len - 1];
                    let [action_group_name, action_group_function] = lastRawTrace?.name?.split('__') ?? [];
                    let t: Trace = {
                        orchestrationTrace: {
                            invocationInput: {
                                actionGroupInvocationInput: {
                                    executionType: 'LAMBDA',
                                    parameters: Object.entries(lastModelInvocationOutputTraceContent.content[len - 1]?.input ?? {}).map(([key, value]) => {
                                        let valueType = typeof value;
                                        return {
                                            name: key,

                                            // this is not perfect but close
                                            type: Array.isArray(value) ? 'array' : valueType == 'boolean' ? 'boolean' : valueType === 'number' ? 'number' : 'string',

                                            value: value
                                        };
                                    }),
                                    actionGroupName: action_group_name,
                                    function: action_group_function
                                },
                                invocationType: 'ACTION_GROUP',
                                traceId: lastRawTrace.traceId
                            }
                        }
                    };
                    traces.push(t);
                    hooks.onTrace(t);
                }
            } catch (e) {
                // Don't do anything if parsing the raw response fails
            }
        }

        console.error(label, '=== BEDROCK AGENT ERROR ===');
        console.error(label, 'Error invoking inline agent:', e);
        error = e;
        hooks.onError(error);
    }

    console.log(label, 'Calculating usage costs...');
    // Make sure we get a pricing model, default to the default model
    let price = modelPricing[model || 'default'] || modelPricing.default;
    usage.inputCost = price.inputPer1000Tokens * (usage.inputTokens / 1000);
    usage.outputCost = price.outputPer1000Tokens * (usage.outputTokens / 1000);
    usage.totalCost = usage.inputCost + usage.outputCost;
    console.log(label, 'Usage costs calculated:', usage);

    hooks.onEnd(usage);

    console.log(label, '=== INVOKE AGENT END ===');

    return {
        error,
        message: responseMsg,
        traces,
        usage,
        executionDuration: Date.now() - startingTime
    };
}

const verificationReprompts: Record<VerifyResponseClassification, string | null> = {
    [Accurate]: null,
    [Unclassified]: null,
    [AccurateWithStatedAssumptions]: 'The previous response had assumptions that were stated.  Specify the assumptions you made.',
    [AccurateWithUnstatedAssumptions]: 'The previous response had assumptions that were not specified.  Specify the assumptions you made.',
    [Inaccurate]: 'The previous response is not factually correct.  Fix it with factually correct information.'
};

async function invokeAgentToVerifyAnswer(
    cmdInput1: InvokeInlineAgentCommandInput,
    model?: string
): Promise<{
    message: string;
    usage: ChatMessageUsage;
    error?: any;
    explanation: string;
    classification: VerifyResponseClassification;
}> {
    let cmdInput = cloneDeep(cmdInput1);

    // Use the verification model
    cmdInput.foundationModel = model ?? DEFAULT_VERIFICATION_MODEL;

    // Remove tools, kb, and collaborators for verification data
    delete cmdInput.inlineSessionState?.conversationHistory;
    delete cmdInput.streamingConfigurations;
    delete cmdInput.actionGroups;
    delete cmdInput.knowledgeBases;
    delete cmdInput.collaborators;
    delete cmdInput.collaboratorConfigurations;
    delete cmdInput.agentCollaboration;
    delete cmdInput.promptOverrideConfiguration;
    delete cmdInput.inlineSessionState?.returnControlInvocationResults;
    delete cmdInput.inlineSessionState?.invocationId;

    cmdInput.instruction = `You are a classification agent.  Classifications are:
- A: Factually accurate
- B: Accurate but containing assumptions that are specified in the response
- C: Accurate but containing assumptions that are not in the response
- F: Inaccurate or containing made up information

Response with the the classification Letter and Explanation as json in an <answer></answer> tag.  Example: <answer>{ "classification": "C", "explanation": "The answer made up data sales data for the year 2024." }</answer>`;
    cmdInput.inputText = 'Classify your previous response';

    let invokeResponse = await invokeAgent(
        cmdInput,
        {
            onStart() {
                // Nothing
            },
            onChunk(chunk) {
                // Nothing
            },
            onTrace(trace) {
                // Nothing
            },
            onEnd() {
                // Nothing
            },
            onError(error) {
                // Nothing
            }
        },
        'VERIFICATION:'
    );

    let rawJson = invokeResponse.message.replace(/<\/? *answer>/g, '');
    let jsonResponse = JSON.parse(rawJson);

    let classification = VerifyResponseClassifications.find((e) => e == jsonResponse.classification);

    return {
        ...invokeResponse,
        classification: classification ?? Accurate,
        explanation: jsonResponse.explanation
    };
}

function convertInvokeEventToActionGroupEvent(event: InvocationInputMember, context: ReturnControlContext): ActionGroupInvocationInput {
    return {
        messageVersion: '1.0',
        function: event.functionInvocationInput!.function,
        parameters: event.functionInvocationInput!.parameters,
        inputText: context.invokeCommand.inputText ?? '',
        sessionId: context.sessionId,
        agent: {
            name: 'INLINE_AGENT',
            version: 'INLINE_AGENT',
            id: 'INLINE_AGENT',
            alias: 'TSTALIASID'
        },
        actionGroup: event.functionInvocationInput!.actionGroup,
        sessionAttributes: context.invokeCommand.inlineSessionState!.sessionAttributes ?? {},
        promptSessionAttributes: context.invokeCommand.inlineSessionState!.promptSessionAttributes ?? {}
    } as ActionGroupInvocationInput;
}

async function invokeActionGroupLambdaFunction(lambda: LambdaClient, functionName: string, returnControl: InvocationInputMember, context: ReturnControlContext) {
    // Invoke Lambda function directly via local endpoint
    console.log('Invoking Lambda function directly via local endpoint:', functionName);
    let response = await lambda.send(
        new InvokeCommand({
            FunctionName: functionName,
            Payload: JSON.stringify(convertInvokeEventToActionGroupEvent(returnControl, context))
        })
    );
    let payload = JSON.parse(Buffer.from(response.Payload!).toString());

    // Check for errors
    if (response.FunctionError || payload.errorMessage) {
        throw new Error(`Function ${functionName} error: ${payload.errorMessage || response.FunctionError || 'Unknown error'}`);
    } else {
        if (payload.response.functionResponse.responseState == null || payload.response.functionResponse.responseState === 'SUCCESS') {
            // Return the response body
            return payload.response.functionResponse.responseBody.TEXT.body;
        } else {
            // Return the error message
            let error = payload.response.functionResponse.responseBody.TEXT.body;
            if (typeof error === 'string' && error.startsWith('{') && error.endsWith('}')) {
                error = jsonparse(error);
            }
            throw new Error(error.message ?? error);
        }
    }
}

class ActionGroupToolContext implements ToolContext {
    actionGroups: Record<string, AgentActionGroup> = {};
    returnControlHandlers: Record<string, (returnControl: InvocationInputMember, context: ReturnControlContext) => Promise<unknown>> = {};
    lambdaClientsByEndpoint: Record<string, LambdaClient> = {};
    // toolToLocalFunction: Record<string, {
    //     functionName: string;
    //     endpoint: string;
    // }> = {};

    instructions: Record<string, string> = {};

    getInstructions(toolIds: string[]) {
        return toolIds
            .map((toolId) => this.instructions[toolId])
            .filter((i) => i != null)
            .join('\n');
    }

    addInstruction(toolId: string, instruction: string) {
        this.instructions[toolId] = instruction;
    }

    getActionGroups(tools: string[]) {
        return tools.map((tool) => this.actionGroups[tool]).filter((a) => a != null);
    }

    add(tool: ToolDefinition) {
        if (tool.executionType !== 'lambda') {
            throw new Error(`Expected lambda tool, got ${tool.executionType}`);
        }

        this.actionGroups[tool.toolId] = {
            actionGroupName: tool.name,
            description: tool.description,
            actionGroupExecutor: {
                lambda: tool.lambdaArn
            },
            functionSchema: {
                functions: tool.functionSchema!
            }
        };

        // Override the action group executor to use a local endpoint if one is provided
        let localEndpoint = localActionGroupEndpoints[tool.toolId];
        if (localEndpoint) {
            // Set the action group executor to return control
            this.actionGroups[tool.toolId].actionGroupExecutor = { customControl: CustomControlMethod.RETURN_CONTROL };

            let functionName = tool.lambdaArn.split(':')[6];

            // Add the return control handler for the tool
            this.returnControlHandlers[tool.toolId] = async (returnControl: InvocationInputMember, context: ReturnControlContext) => {
                let lambda = this.lambdaClientsByEndpoint[localEndpoint];
                if (!lambda) {
                    lambda = new LambdaClient({ region: getRegion(), endpoint: localEndpoint });
                    this.lambdaClientsByEndpoint[localEndpoint] = lambda;
                }

                return await invokeActionGroupLambdaFunction(lambda, functionName, returnControl, context);
            };
        }
    }
    addWithHandler(tool: ToolDefinition, handler: (returnControl: InvocationInputMember, context: ReturnControlContext) => Promise<any>) {
        this.actionGroups[tool.toolId] = {
            actionGroupName: tool.name,
            description: tool.description,
            actionGroupExecutor: {
                customControl: CustomControlMethod.RETURN_CONTROL
            },
            functionSchema: {
                functions: tool.functionSchema!
            }
        };

        // Add the return control handler for the tool
        this.returnControlHandlers[tool.toolId] = handler;
    }
    getReturnControlHandlers(): Record<string, (returnControl: InvocationInputMember, context: ReturnControlContext) => Promise<unknown>> {
        return this.returnControlHandlers;
    }
}

function processActionGroupTool(tool: ToolDefinition, toolContext: Record<string, ToolContext>) {
    let actionGroupManager = toolContext.actionGroupManager as ActionGroupToolContext;
    if (!actionGroupManager) {
        actionGroupManager = new ActionGroupToolContext();
        toolContext.actionGroupManager = actionGroupManager;
    }
    actionGroupManager.add(tool);
}

function processInlineTool(tool: InlineToolDefinition, toolContext: Record<string, ToolContext>) {
    let actionGroupManager = toolContext.actionGroupManager as ActionGroupToolContext;
    if (!actionGroupManager) {
        actionGroupManager = new ActionGroupToolContext();
        toolContext.actionGroupManager = actionGroupManager;
    }
    if (tool.code && !tool.handler) {
        let fn = eval(`(${tool.code})`);
        tool.handler = fn;
    } else if (tool.handler == null) {
        throw new Error('Inline tool has no handler');
    }
    actionGroupManager.addWithHandler(tool, (returnControl, context) => {
        let event = convertInvokeEventToActionGroupEvent(returnControl, context);
        let rawParams = event.parameters;
        let params: Record<string, unknown> = (rawParams ?? []).reduce(
            (p, c) => ({ ...p, [c.name!]: (parsers[c.type!] ?? parsers.identity)(c.value!) }),
            {} as Record<string, unknown>
        );

        // Parse any json inputs
        Object.entries(params).forEach(([key, value]) => {
            if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
                params[key] = jsonparse(value);
            }
        });
        return tool.handler!(event, params);
    });
}

/**
 * Invokes the Bedrock Inline Agent to generate a response to the user's message.
 * @param chatSession The chat session to invoke the agent on.
 * @param userId The user id of the user who is sending the message.
 * @param messageId The message id of the user's message.
 * @param questionFromUser The question from the user with optional instructions prepended to ask the agent.
 * @param responseStream The response stream to write the agent's response to.
 * @param conversationHistory The conversation history to reattach to the session if any.
 * @returns The chat message with the agent's response and the usage statistics. Note
 *          we have already streamd back this response, we are returning it to the caller
 *          to persist it should it be needed.
 */
export async function invokeAgentToGetAnswer(
    chatSession: ChatSession<RecordOrUndef>,
    simpleUser: SimpleAuthenticatedUser<any>,
    messageId: string,
    questionFromUser: string,
    responseStream: EnhancedResponseStream,
    agentAndTools: AgentAndTools,
    features: ChatAppOverridableFeaturesForConverseFn,
    memoryFeature: UserMemoryFeatureWithMemoryInfo,
    agentPostProcessorFnArn?: string,
    conversationHistory?: ConversationHistory,
    // The semantic directives that were applied to the prompt so we can add to trace to make it easier to debug
    appliedDirectives?: SemanticDirective[]
): Promise<ChatMessageForCreate> {
    console.log('=== INVOKE AGENT START ===');
    console.log('invokeAgentToGetAnswer called with:', {
        sessionId: chatSession.sessionId,
        userId: simpleUser.userId,
        messageId,
        questionLength: questionFromUser.length,
        hasConversationHistory: !!conversationHistory,
        conversationHistoryLength: conversationHistory?.messages?.length,
        agentId: agentAndTools.agent.agentId,
        chatAppId: chatSession.chatAppId,
        features,
        appliedDirectivesCount: appliedDirectives?.length ?? 0
    });

    const toolContext: Record<string, ToolContext> = {};

    for (const tool of agentAndTools.tools ?? []) {
        if (!tool.name) {
            console.error('Tool has no name:', tool.toolId);
            throw new Error(`Tool ${tool.toolId} has no name`);
        }

        if (tool.executionType === 'mcp') {
            console.log('Tool is an MCP tool:', tool.toolId);
            processMcpTool(tool as McpToolDefinition, toolContext, {
                sessionAttributes: chatSession.sessionAttributes,
                promptSessionAttributes: chatSession.sessionAttributes
            });
        } else if (tool.executionType === 'lambda') {
            if (!tool.lambdaArn) {
                console.error('Tool has no lambda ARN:', tool.toolId);
                throw new Error(`Tool ${tool.toolId} has no lambda ARN`);
            }

            if (!tool.functionSchema) {
                console.error('Tool has no function schema:', tool.toolId);
                throw new Error(`Tool ${tool.toolId} has no function schema`);
            }
            console.log('Tool is an Action Group tool:', tool.toolId);
            processActionGroupTool(tool, toolContext);
        } else if (tool.executionType === 'inline') {
            console.log('Tool is an Inline tool:', tool.toolId);
            processInlineTool(tool, toolContext);
        } else {
            // This should be exhaustive, but adding explicit never check for type safety
            const _exhaustiveCheck: never = tool;
            console.error('Tool execution type is not supported:', (_exhaustiveCheck as ToolDefinition).executionType, 'for tool:', (_exhaustiveCheck as ToolDefinition).toolId);
            throw new Error(`Tool ${(_exhaustiveCheck as ToolDefinition).toolId} execution type is not supported, it is ${(_exhaustiveCheck as ToolDefinition).executionType}`);
        }
    }

    //TODO:Clint - can we remove this block now?
    // if (false && memoryFeature.enabled) {
    //     let [userPreferences, userSemantics] = await Promise.all([
    //         getMemoryEvent(simpleUser.userId, memoryFeature.memoryId, memoryFeature.maxMemoryRecordsPerPrompt, 'preferences', '*'),
    //         getMemoryEvent(simpleUser.userId, memoryFeature.memoryId, memoryFeature.maxMemoryRecordsPerPrompt, 'semantic', '*')
    //     ]);

    //     if (userPreferences.length > 0 || userSemantics.length > 0) {
    //         console.log('User Preferences:', userPreferences);
    //         console.log('User Semantics:', userSemantics);
    //         toolContext.memoryToolContext = {
    //             getActionGroups: (toolIds: string[]) => [],
    //             getInstructions: (toolIds: string[]) => {
    //                 return `<user-preferences>\n\t${userPreferences.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n\t')}\n</user-preferences><user-semantics>\n\t${userSemantics.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n\t')}\n</user-semantics>`;
    //             }
    //         };
    /*
                        let memoryToolId = "pika_user_memory";
            
                        // Add an inline tool to retrieve the user's memory and preferences
                        processInlineTool({
                            executionType: 'inline',
                            toolId: memoryToolId,
                            name: memoryToolId,
                            description: 'Retrieves the user\'s memory and preferences',
                            functionSchema: [
                                {
                                    name: 'get-memories',
                                    description: 'Retrieve the user\'s memory and preferences',
                                    parameters: {
                                        strategy: {
                                            type: 'string',
                                            description: Object.keys(MEMORY.strategies ?? {}).join(', '),
                                            required: true
                                        },
                                        query: {
                                            type: 'string',
                                            description: 'The query to use to retrieve the user\'s memory and preferences',
                                            required: true
                                        },
                                        nextToken: {
                                            type: 'string',
                                            description: 'The next token to use to retrieve the user\'s memory and preferences, if any',
                                            required: false
                                        }
                                    },
                                    requireConfirmation: 'DISABLED'
                                }
                            ],
                            code: "", // Not used for this tool
                            displayName: 'UserMemory',
                            supportedAgentFrameworks: [],
                            version: 1,
                            createdBy: simpleUser.userId,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                            lastModifiedBy: simpleUser.userId,
                            handler: async (event: ActionGroupInvocationInput) => {
                                let rawParams = event.parameters;
                                let params: GetMemoryArgs = (rawParams ?? []).reduce(
                                    (p, c) => ({ ...p, [c.name!]: (parsers[c.type!] ?? parsers.identity)(c.value!) }),
                                    {} as GetMemoryArgs
                                );
            
                                // Parse any json inputs
                                Object.entries(params).forEach(([key, value]) => {
                                    if (typeof value === 'string' && value.startsWith('{') && value.endsWith('}')) {
                                        params[key as keyof GetMemoryArgs] = jsonparse(value);
                                    }
                                });
            
            
            
                                return await getMemoryEvent(
                                    MEMORY,
                                    simpleUser.userId,
                                    params
                                );
                            }
                        }, toolContext);
            
                        // Add the tool to the agent and collaborators so they can use it
                        agentAndTools.agent.toolIds.push(memoryToolId);
                        agentAndTools.collaborators?.forEach((collaborator) => {
                            collaborator.toolIds?.push(memoryToolId);
                        });
                        
                        //   (toolContext.actionGroupManager as ActionGroupToolContext).addInstruction(memoryToolId, `Before generating your response, use the ${memoryToolId} tool to retrieve the user's memory and preferences.`);
                        */
    //     }
    // }

    let toolContexts = Object.values(toolContext);

    function toKnowledgeBase(kb: AgentDefinitionKnowledgeBase): KnowledgeBase {
        return {
            knowledgeBaseId: kb.id,
            description: kb.description,
            ...(kb.filter || kb.numberOfResults
                ? {
                      retrievalConfiguration: {
                          vectorSearchConfiguration: {
                              filter: kb.filter ? replaceTemplateValues(kb.filter, simpleUser.customUserData) : undefined,
                              ...(kb.numberOfResults ? { numberOfResults: kb.numberOfResults } : {})
                          }
                      }
                  }
                : {})
        };
    }

    const knowledgeBases: KnowledgeBase[] = (agentAndTools.agent.knowledgeBases ?? []).map(toKnowledgeBase);

    console.log('Knowledge bases:', JSON.stringify(knowledgeBases, null, 2));

    // const authDataGzipHexEncoded = simpleUser.authData ? gzipAndBase64EncodeString(JSON.stringify(simpleUser.authData)) : undefined;

    console.log('Building command input...');
    const cmdInput: InvokeInlineAgentCommandInput = {
        sessionId: chatSession.sessionId,
        foundationModel: agentAndTools.agent.foundationModel ?? DEFAULT_ANTHROPIC_MODEL,
        instruction: [agentAndTools.agent.basePrompt, ...toolContexts.map((context) => context.getInstructions?.(agentAndTools.agent.toolIds)).filter((a) => a != null)].join('\n'),
        inputText: questionFromUser,
        enableTrace: true,
        streamingConfigurations: {
            streamFinalResponse: true
        },
        actionGroups: toolContexts.map((context) => context.getActionGroups(agentAndTools.agent.toolIds)).flat(),
        collaborators: agentAndTools.collaborators?.map((collaborator) => {
            let col: Collaborator = {
                agentName: collaborator.agentId,
                instruction: [collaborator.basePrompt, ...toolContexts.map((context) => context.getInstructions?.(collaborator.toolIds ?? [])).filter((a) => a != null)].join('\n'),
                agentCollaboration: collaborator.agentCollaboration ?? (collaborator.collaborators?.length ? AgentCollaboration.SUPERVISOR : AgentCollaboration.DISABLED), // (collaborator.collaborators?.length ? AgentCollaboration.SUPERVISOR : AgentCollaboration.DISABLED),//?? (collaborator.collaboratorConfigurations?.length ? AgentCollaboration.SUPERVISOR : AgentCollaboration.DISABLED), (collaborator.collaboratorConfigurations?.length ? AgentCollaboration.SUPERVISOR : AgentCollaboration.DISABLED),
                foundationModel: collaborator.foundationModel ?? agentAndTools.agent.foundationModel ?? DEFAULT_ANTHROPIC_MODEL,
                actionGroups: toolContexts.map((context) => context.getActionGroups(collaborator.toolIds ?? [])).flat(),
                knowledgeBases: collaborator.knowledgeBases?.map(toKnowledgeBase) ?? [],

                collaboratorConfigurations: collaborator.collaborators?.map((subCollaborator) => {
                    return {
                        collaboratorName: subCollaborator.agentId,
                        collaboratorInstruction: subCollaborator.instruction,
                        relayConversationHistory: subCollaborator.historyRelay as RelayConversationHistory
                    };
                })
            };
            return col;
        }),
        collaboratorConfigurations: agentAndTools.agent.collaborators?.map((collaborator) => {
            return {
                collaboratorName: collaborator.agentId,
                collaboratorInstruction: collaborator.instruction,
                relayConversationHistory: collaborator.historyRelay as RelayConversationHistory
            };
        }),
        agentCollaboration: agentAndTools.agent.agentCollaboration ?? (agentAndTools.agent.collaborators?.length ? AgentCollaboration.SUPERVISOR : AgentCollaboration.DISABLED),
        knowledgeBases,
        inlineSessionState: {
            // Include the conversation history if we need to reattach to the session
            ...(conversationHistory ? { conversationHistory } : {}),
            promptSessionAttributes: {
                // Everything in here is available to the agent in the prompt
                ...chatSession.sessionAttributes,
                ...(simpleUser.customUserData ? simpleUser.customUserData : {}),
                currentDate: new Date().toISOString(),
                messageId: messageId
            },
            //SessionDataWithChatUserCustomDataSpreadIn
            sessionAttributes: {
                //TODO: why doesn't the definition of sessionAttributes (the type) include userId and currentDate?
                ...chatSession.sessionAttributes,
                ...(simpleUser.customUserData ? simpleUser.customUserData : {}),
                userId: simpleUser.userId,
                chatAppId: chatSession.chatAppId,
                agentId: agentAndTools.agent.agentId,
                currentDate: new Date().toISOString()
            }
        }
    };

    if (cmdInput.collaborators?.length && agentPostProcessorFnArn != null) {
        console.log('Adding post-processing collaborator...');
        let postProcessor = {
            overrideLambda: agentPostProcessorFnArn,
            promptConfigurations: [
                {
                    promptType: PromptType.POST_PROCESSING,
                    promptCreationMode: CreationMode.OVERRIDDEN,
                    promptState: PromptState.ENABLED,
                    basePromptTemplate: JSON.stringify({
                        anthropic_version: 'bedrock-2023-05-31',
                        system: '',
                        messages: [
                            {
                                role: 'user',
                                content: [
                                    {
                                        type: 'text',
                                        text: `
                        Here is the latest raw response from the function calling agent that you should transform: <latest_response>$latest_response$</latest_response>.
                        DO NOT EDIT OR REMOVE ANYTHING FROM THE LATEST RESPONSE.
                        Please output your transformed response within <final_response></final_response> XML tags.
                        `
                                    }
                                ]
                            }
                        ]
                    }),
                    //inferenceConfiguration: undefined,
                    parserMode: CreationMode.OVERRIDDEN
                }
            ]
        };

        if (cmdInput.promptOverrideConfiguration == null) {
            cmdInput.promptOverrideConfiguration = {
                promptConfigurations: []
            };
        }
        cmdInput.promptOverrideConfiguration.overrideLambda = postProcessor.overrideLambda;

        if (cmdInput.promptOverrideConfiguration.promptConfigurations == null) {
            cmdInput.promptOverrideConfiguration.promptConfigurations = [];
        }
        cmdInput.promptOverrideConfiguration.promptConfigurations.push(...postProcessor.promptConfigurations);
    }

    let error: unknown;
    let startingTime = Date.now();

    let responseMsg = '';
    let usage: ChatMessageUsage = {
        inputTokens: 0,
        outputTokens: 0,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0
    };
    let traces: Trace[] = [];

    function addUsage(newUsage: ChatMessageUsage) {
        console.log('Adding usage costs...');
        usage.inputTokens += newUsage.inputTokens;
        usage.outputTokens += newUsage.outputTokens;
        usage.inputCost += newUsage.inputCost;
        usage.outputCost += newUsage.outputCost;
        usage.totalCost += newUsage.totalCost;
        console.log('Current usage costs calculated:', usage);
    }

    let citationCount = 0;
    let hooks: InvokeAgentHooks = {
        returnControlHandlers: Object.values(toolContext).reduce((acc, context) => {
            return Object.assign(acc, context.getReturnControlHandlers?.() ?? {});
        }, {}),

        onStart: function (): void {
            console.log('Setting up HTTP response stream...');
            awslambda.HttpResponseStream.from(responseStream, {
                statusCode: 200,
                headers: { 'x-chatbot-session-id': chatSession.sessionId }
            });
            console.log('HTTP response stream set up with session ID:', chatSession.sessionId);
        },
        onChunk: function (chunk: string, chunkCount: number, attribution?: Attribution): void {
            responseMsg += chunk;
            responseStream.write(chunk);
            console.log(`Chunk ${chunkCount} written to response stream`);
            attribution?.citations?.forEach((citation) => {
                let citationText = `[Citation ${++citationCount}](${encodeURI(citation?.retrievedReferences?.[0]?.location?.s3Location?.uri!)})`;
                responseMsg += citationText;
                responseStream.write(citationText);
            });
        },
        onTrace: function (trace: Trace): void {
            traces.push(trace);
            responseStream.write(`<trace>${JSON.stringify(trace)}</trace>`);
        },
        onEnd: function (): void {
            // Nothing
        },
        onError: function (error: any): void {
            throw error;
        }
    };
    let verifications: {
        main: VerifyResponseClassification;
        correction?: VerifyResponseClassification;
    } = {
        main: Unclassified
    };
    try {
        console.log(`Initializing tool contexts (${toolContexts.length})...`);
        await Promise.all(toolContexts.map((context) => context.initialize?.(chatSession.sessionId)));

        let mainResponse = await invokeAgent(cmdInput, hooks, 'MAIN:', appliedDirectives);
        addUsage(mainResponse.usage);
        if (mainResponse.error) {
            throw mainResponse.error;
        }

        if (features.verifyResponse.enabled) {
            console.log('Verifying response...');
            let verifyResponse = await invokeAgentToVerifyAnswer(cmdInput, agentAndTools.agent.verificationFoundationModel);
            addUsage(verifyResponse.usage);
            if (verifyResponse.error) {
                console.log('Error during Verification.  Proceeding w/o verification', verifyResponse.error);
            }
            verifications.main = verifyResponse.classification;
            hooks.onTrace({
                orchestrationTrace: {
                    rationale: {
                        text: `Verified Response: ${verifyResponse.classification}`
                    }
                }
            });

            if (features.verifyResponse.autoRepromptThreshold) {
                console.log('Reprompting response feature is enabled for threshold:', features.verifyResponse.autoRepromptThreshold);
                let reprompt = verificationReprompts[verifyResponse.classification];

                // Only reprompt if threshold is at or below the classification severity
                const shouldReprompt = reprompt && verifyResponse.classification >= features.verifyResponse.autoRepromptThreshold;

                if (shouldReprompt) {
                    console.log(
                        `Reprompting response since classification is at or below threshold: ${verifyResponse.classification} >= ${features.verifyResponse.autoRepromptThreshold}`
                    );
                    hooks.onTrace({
                        orchestrationTrace: {
                            rationale: {
                                text: 'Correcting response.'
                            }
                        }
                    });
                    hooks.onChunk('\n\n### Corrections\n', 100);
                    reprompt += `\n\nReason: ${verifyResponse.explanation}`;

                    console.log('Classification requires reprompt:', verifyResponse.classification, reprompt);
                    // Delete history as it was already saturated with the main prompt
                    delete cmdInput.inlineSessionState?.conversationHistory;

                    cmdInput.inputText = reprompt!;
                    let correctionResponse = await invokeAgent(
                        cmdInput,
                        {
                            ...hooks,
                            onStart() {
                                // Nothing
                            }
                        },
                        'CORRECTION:'
                    );
                    addUsage(correctionResponse.usage);
                    if (correctionResponse.error) {
                        throw correctionResponse.error;
                    }
                    let correctionVerifyResponse = await invokeAgentToVerifyAnswer(cmdInput, agentAndTools.agent.verificationFoundationModel);
                    addUsage(correctionVerifyResponse.usage);
                    if (correctionVerifyResponse.error) {
                        console.log('Error during Correction Verification.  Proceeding w/o verification', correctionVerifyResponse.error);
                    }
                    verifications.correction = correctionVerifyResponse.classification;
                    hooks.onTrace({
                        orchestrationTrace: {
                            rationale: {
                                text: `Correction Verified Response: ${correctionVerifyResponse.classification}`
                            }
                        }
                    });
                }
            }
        }
    } catch (e) {
        console.error('=== BEDROCK AGENT ERROR ===');
        console.error('Error invoking inline agent:', e);
        const msg = '\nOops! Something glitched on my end.';
        responseMsg += msg;
        error = e;
        responseStream.write(msg);
        console.log('Error message written to response stream');
    } finally {
        console.log('Ending tool contexts...');
        await Promise.all(toolContexts.map((context) => context.end?.(chatSession.sessionId)));
    }

    try {
        if (memoryFeature.enabled) {
            // Build typed memory content array using the memory.ts buildTypedMemoryContents function
            const memoryContents = buildTypedMemoryContents(questionFromUser, responseMsg, traces);
            let memory = await createTypedMemoryEvent(memoryFeature.memoryId, simpleUser.userId, chatSession.sessionId, memoryContents);
            console.log('Memory event created:', memory);
        }
    } catch (e) {
        console.error('Error creating memory event:', e);
    }

    console.log('Building assistant message response...');
    const assistantMessage: ChatMessageForCreate = {
        sessionId: chatSession.sessionId,
        source: 'assistant',
        userId: simpleUser.userId,
        message: responseMsg,
        executionDuration: Date.now() - startingTime,
        //TODO: need to figure out what the actual type is for the trace and whether to use my own type or the one from the SDK
        traces: convertDatesToStrings(traces) as Trace[],
        usage,
        verifications,
        ...(error ? { additionalData: sanitizeAndStringifyError(error) } : {})
    };

    console.log('Assistant message built:', {
        sessionId: assistantMessage.sessionId,
        messageLength: assistantMessage.message?.length,
        executionDuration: assistantMessage.executionDuration,
        hasError: !!error,
        tracesCount: traces.length
    });
    console.log('=== INVOKE AGENT END ===');

    return assistantMessage;
}

/**
 * Generates a title for a chat session using Bedrock.
 *
 * @param userQuestionAsked The question that was asked by the user.
 * @param answerToQuestionFromAgent The answer that was generated by the agent.
 * @returns The title for the chat session.
 */
export async function getTitleFromBedrockIfNeeded(userQuestionAsked: string, answerToQuestionFromAgent: string): Promise<string> {
    const prompt = `Generate a concise title (3-8 words) that captures the main topic or question from this conversation:

<question>${userQuestionAsked}</question>
<response>${answerToQuestionFromAgent}</response>

The title should be specific enough to distinguish this conversation from others.

IMPORTANT: Return ONLY the title text with no explanations, quotes, or additional text.`;

    let response = await bedrockClient.send(
        new InvokeModelCommand({
            modelId: DEFAULT_ANTHROPIC_MODEL,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: DEFAULT_ANTHROPIC_VERSION,
                max_tokens: 200,
                top_k: 250,
                temperature: 1,
                top_p: 0.999,
                messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
            })
        })
    );

    const responseBody = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(responseBody);
    return parsedResponse.content[0].text;
}

function replaceTemplateValues(filter: RetrievalFilter, userData: any): RetrievalFilter {
    const replaceInValue = (value: any): any => {
        if (typeof value === 'string') {
            // Check if the entire value is a single template like "{userId}"
            const singleTemplateMatch = value.match(/^{([^}]+)}$/);
            if (singleTemplateMatch) {
                // Handle single template - can return any data type
                const path = singleTemplateMatch[1];
                const resolvedValue = resolveTemplatePath(path, userData);
                return resolvedValue !== undefined ? resolvedValue : value;
            }

            // Handle embedded templates - must return string
            return value.replace(/\{([^}]+)\}/g, (match, path) => {
                const resolvedValue = resolveTemplatePath(path, userData);
                if (resolvedValue === undefined) {
                    return match; // Return original template if no match
                }
                // Convert to string for embedded templates
                return String(resolvedValue);
            });
        }
        if (Array.isArray(value)) {
            return value.map(replaceInValue);
        }
        return value;
    };

    // Helper function to resolve a template path
    const resolveTemplatePath = (path: string, userData: any): any => {
        // Handle edge cases
        if (!userData || typeof userData !== 'object') {
            return undefined;
        }

        // Clean up the path - trim whitespace and filter out empty segments
        const cleanPath = path.trim();
        if (!cleanPath) {
            return undefined;
        }

        const pathParts = cleanPath.split('.').filter((part: string) => part.length > 0);
        if (pathParts.length === 0) {
            return undefined;
        }

        // Navigate the object path
        let result = userData;
        for (const part of pathParts) {
            if (result === null || result === undefined || typeof result !== 'object') {
                return undefined;
            }
            result = result[part];
        }

        // Return the value if it's a primitive type or array
        if (result === null || typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean' || Array.isArray(result)) {
            return result;
        }

        // Don't return complex objects
        return undefined;
    };

    const replaceInFilterAttribute = (attr: any): any => ({
        ...attr,
        value: replaceInValue(attr.value)
    });

    // Handle all the different RetrievalFilter union types
    if ('equals' in filter) {
        return { equals: replaceInFilterAttribute(filter.equals) };
    }
    if ('notEquals' in filter) {
        return { notEquals: replaceInFilterAttribute(filter.notEquals) };
    }
    if ('greaterThan' in filter) {
        return { greaterThan: replaceInFilterAttribute(filter.greaterThan) };
    }
    if ('greaterThanOrEquals' in filter) {
        return { greaterThanOrEquals: replaceInFilterAttribute(filter.greaterThanOrEquals) };
    }
    if ('lessThan' in filter) {
        return { lessThan: replaceInFilterAttribute(filter.lessThan) };
    }
    if ('lessThanOrEquals' in filter) {
        return { lessThanOrEquals: replaceInFilterAttribute(filter.lessThanOrEquals) };
    }
    if ('in' in filter) {
        return { in: replaceInFilterAttribute(filter.in) };
    }
    if ('notIn' in filter) {
        return { notIn: replaceInFilterAttribute(filter.notIn) };
    }
    if ('startsWith' in filter) {
        return { startsWith: replaceInFilterAttribute(filter.startsWith) };
    }
    if ('listContains' in filter) {
        return { listContains: replaceInFilterAttribute(filter.listContains) };
    }
    if ('stringContains' in filter) {
        return { stringContains: replaceInFilterAttribute(filter.stringContains) };
    }
    if ('andAll' in filter && filter.andAll) {
        return {
            andAll: filter.andAll.map((subFilter) => replaceTemplateValues(subFilter, userData))
        };
    }
    if ('orAll' in filter && filter.orAll) {
        return {
            orAll: filter.orAll.map((subFilter) => replaceTemplateValues(subFilter, userData))
        };
    }

    // Return the filter unchanged if it doesn't match any known types
    return filter;
}
