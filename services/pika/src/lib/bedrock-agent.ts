import {
    type AgentActionGroup,
    BedrockAgentRuntimeClient,
    type ConversationHistory,
    InvokeInlineAgentCommand,
    type InvokeInlineAgentCommandInput,
    type Trace
} from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import {
    Accurate,
    AccurateWithStatedAssumptions,
    AccurateWithUnstatedAssumptions,
    type AgentAndTools,
    type ChatAppOverridableFeaturesForConverseFn,
    type ChatMessageForCreate,
    type ChatMessageUsage,
    type ChatSession,
    Inaccurate,
    type SimpleAuthenticatedUser,
    type VerifyResponseClassification,
    VerifyResponseClassifications
} from '@pika/shared/types/chatbot/chatbot-types';
import cloneDeep from 'lodash.clonedeep';
import type { EnhancedResponseStream } from '../lambda/converse/EnhancedResponseStream';
import { modelPricing } from '../lambda/converse/model-pricing';
import { convertDatesToStrings, getRegion, sanitizeAndStringifyError } from './utils';
// import { Trace } from './bedrock-types';

const DEFAULT_ANTHROPIC_MODEL = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';
//const DEFAULT_ANTHROPIC_MODEL = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';
const DEFAULT_ANTHROPIC_VERSION = 'bedrock-2023-05-31';

const DEFAULT_VERIFICATION_MODEL = 'anthropic.claude-3-haiku-20240307-v1:0'; //'amazon.nova-micro-v1:0';

const bedrockAgentClient = new BedrockAgentRuntimeClient({ region: getRegion() });
const bedrockClient = new BedrockRuntimeClient({ region: getRegion() });

// This code helps when running locally.  It's not needed for production.
if (global.awslambda == null) {
    global.awslambda = {
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
}

interface InvokeAgentHooks {
    onStart: () => void;
    onChunk: (chunk: string, chunkIndex: number) => void;
    onTrace: (trace: Trace) => void;
    onEnd: (usage: ChatMessageUsage) => void;
    onError: (error: any) => void;
}
async function invokeAgent(cmdInput: InvokeInlineAgentCommandInput, hooks: InvokeAgentHooks, label: string) {
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
        const response = await bedrockAgentClient.send(cmd);
        console.log(label, 'Bedrock Agent Runtime response received');
        console.log(label, 'InvokeInlineAgentCommandResponse', response);

        if (response.completion === undefined) {
            console.error(label, 'No completion found in response');
            throw new Error('No completion found in response');
        }

        hooks.onStart();

        console.log(label, 'Processing completion stream...');
        let chunkCount = 0;
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

                hooks.onChunk(decodedChunk, chunkCount);
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
                    trace.orchestrationTrace?.invocationInput ||
                    trace.orchestrationTrace?.observation?.actionGroupInvocationOutput ||
                    trace.orchestrationTrace?.modelInvocationOutput ||
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
                    if (trace.failureTrace?.failureReason === 'Max iterations exceeded') {
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
    [AccurateWithStatedAssumptions]: 'The previous response had assumptions that were stated.  Specify the assumptions you made.',
    [AccurateWithUnstatedAssumptions]: 'The previous response had assumptions that were not specified.  Specify the assumptions you made.',
    [Inaccurate]: 'The previous response is not factually correct.  Fix it with factually correct information.'
};

async function invokeAgentToVerifyAnswer(
    cmdInput1: InvokeInlineAgentCommandInput
): Promise<{ message: string; usage: ChatMessageUsage; error?: any; classification: VerifyResponseClassification }> {
    let cmdInput = cloneDeep(cmdInput1);

    // Use the verification model
    cmdInput.foundationModel = DEFAULT_VERIFICATION_MODEL;

    // Remove tools and kb for verification data
    delete cmdInput.inlineSessionState?.conversationHistory;
    delete cmdInput.streamingConfigurations;
    delete cmdInput.actionGroups;
    delete cmdInput.knowledgeBases;

    cmdInput.instruction = `You are a classification agent.  Classifications are:
- A: Factually accurate
- B: Accurate but containing assumptions that are specified in the response
- C: Accurate but containing assumptions that are not in the response
- F: Inaccurate or containing made up information

Response with ONLY the classification Letter inside an <answer></answer> tag.  Example: <answer>A</answer>`;
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

    let classificationLetter = invokeResponse.message.replace(/<\/? *answer>/g, '');
    let classification = VerifyResponseClassifications.find((e) => e == classificationLetter);

    return {
        ...invokeResponse,
        classification: classification ?? Accurate
    };
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
    chatSession: ChatSession,
    simpleUser: SimpleAuthenticatedUser<any>,
    messageId: string,
    questionFromUser: string,
    responseStream: EnhancedResponseStream,
    agentAndTools: AgentAndTools,
    features: ChatAppOverridableFeaturesForConverseFn,
    conversationHistory?: ConversationHistory
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
        features
    });

    const actionGroups: AgentActionGroup[] = [];
    for (const tool of agentAndTools.tools ?? []) {
        if (!tool.executionType.includes('lambda')) {
            console.error('Tool execution type is not lambda it is:', tool.executionType, 'for tool:', tool.toolId);
            throw new Error(`Tool ${tool.toolId} execution type is not lambda, it is ${tool.executionType}`);
        }

        if (!tool.name) {
            console.error('Tool has no name:', tool.toolId);
            throw new Error(`Tool ${tool.toolId} has no name`);
        }

        if (!tool.lambdaArn) {
            console.error('Tool has no lambda ARN:', tool.toolId);
            throw new Error(`Tool ${tool.toolId} has no lambda ARN`);
        }

        if (!tool.functionSchema) {
            console.error('Tool has no function schema:', tool.toolId);
            throw new Error(`Tool ${tool.toolId} has no function schema`);
        }

        actionGroups.push({
            actionGroupName: tool.name,
            description: tool.description,
            actionGroupExecutor: {
                lambda: tool.lambdaArn
            },
            functionSchema: {
                functions: tool.functionSchema
            }
        });
    }

    // const authDataGzipHexEncoded = simpleUser.authData ? gzipAndBase64EncodeString(JSON.stringify(simpleUser.authData)) : undefined;

    console.log('Building command input...');
    const cmdInput: InvokeInlineAgentCommandInput = {
        sessionId: chatSession.sessionId,
        foundationModel: DEFAULT_ANTHROPIC_MODEL,
        instruction: agentAndTools.agent.basePrompt,
        inputText: questionFromUser,
        enableTrace: true,
        streamingConfigurations: {
            streamFinalResponse: true
        },
        actionGroups: actionGroups,
        knowledgeBases: (agentAndTools.agent.knowledgeBases ?? []).map((kb) => ({
            knowledgeBaseId: kb.id,
            description: kb.description
        })),
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

    let hooks: InvokeAgentHooks = {
        onStart: function (): void {
            console.log('Setting up HTTP response stream...');
            awslambda.HttpResponseStream.from(responseStream, {
                statusCode: 200,
                headers: { 'x-chatbot-session-id': chatSession.sessionId }
            });
            console.log('HTTP response stream set up with session ID:', chatSession.sessionId);
        },
        onChunk: function (chunk: string, chunkCount: number): void {
            responseMsg += chunk;
            responseStream.write(chunk);
            console.log(`Chunk ${chunkCount} written to response stream`);
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
    try {
        console.log('Invoking main agent...');
        let mainResponse = await invokeAgent(cmdInput, hooks, 'MAIN:');
        addUsage(mainResponse.usage);
        if (mainResponse.error) {
            throw mainResponse.error;
        }

        if (features.verifyResponse.enabled) {
            console.log('Verifying response...');
            let verifyResponse = await invokeAgentToVerifyAnswer(cmdInput);
            addUsage(verifyResponse.usage);
            if (verifyResponse.error) {
                console.log('Error during Verification.  Proceeding w/o verification', verifyResponse.error);
            }

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
                    console.log('Classification requires reprompt:', verifyResponse.classification, reprompt);
                    // Delete history as it was already saturated with the main prompt
                    delete cmdInput.inlineSessionState?.conversationHistory;

                    cmdInput.inputText = reprompt;
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

//TODO: We found the actual type for the SDK and are using it.  Leaving this here for now
// since there is some confusion as to whether it is correct, although according to TS compiler, it is.
// interface CustomOrchestrationTraceMember {
//     failureTrace?: {
//         failureReason: string;
//     };
//     orchestrationTrace?: CustomOrchestrationTrace & {
//         rationale?: {
//             text: string;
//         };
//         modelInvocationInput?: {
//             foundationModel: string;
//         };
//         modelInvocationOutput?: {
//             traceId: string;
//             rawResponse?: any;
//             metadata?: {
//                 usage?: {
//                     inputTokens: number;
//                     outputTokens: number;
//                 };
//             };
//         };

//         invocationInput?: {};
//         observation?: {
//             actionGroupInvocationOutput?: {
//                 text: string;
//                 metadata?: {};
//             };
//         };
//     };
// }
