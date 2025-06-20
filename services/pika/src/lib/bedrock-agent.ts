import { AgentAndTools, ChatMessageForCreate, ChatMessageUsage, ChatSession, SimpleAuthenticatedUser } from '@pika/shared/types/chatbot/chatbot-types';
import {
    AgentActionGroup,
    BedrockAgentRuntimeClient,
    ConversationHistory,
    CustomOrchestrationTrace,
    InvokeInlineAgentCommand,
    InvokeInlineAgentCommandInput
} from '@aws-sdk/client-bedrock-agent-runtime';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { EnhancedResponseStream } from '../lambda/converse/EnhancedResponseStream';
import { modelPricing } from '../lambda/converse/model-pricing';
import { convertDatesToStrings, getRegion, sanitizeAndStringifyError } from './utils';
import { getValueFromParameterStore } from './ssm';
import { gzipAndBase64EncodeString } from '@pika/shared/util/server-utils';

const DEFAULT_ANTHROPIC_MODEL = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';
//const DEFAULT_ANTHROPIC_MODEL = 'us.anthropic.claude-3-5-haiku-20241022-v1:0';
const DEFAULT_ANTHROPIC_VERSION = 'bedrock-2023-05-31';

const bedrockAgentClient = new BedrockAgentRuntimeClient({ region: getRegion() });
const bedrockClient = new BedrockRuntimeClient({ region: getRegion() });

if (global.awslambda== null){
    global.awslambda = {
        streamifyResponse: (handler) => {
            //handler = streamifyResponseOrig(handler);
            return (event:any, context:any) => handler(event, context.responseStream, context);
        },
        HttpResponseStream: class HttpResponseStream {
            static from(underlyingStream:any, prelude:any) {
                let set = (key:any,value:any)=>{};
                if (underlyingStream.set){
                    set = underlyingStream.set.bind(underlyingStream);
                } else if (underlyingStream.headers){
                    set = underlyingStream.headers.set.bind(underlyingStream.headers);
                }
                Object.entries(prelude.headers).forEach(([key, value]) => {
                    set(key,value);
                });
                //underlyingStream.setContentType(METADATA_PRELUDE_CONTENT_TYPE)
                // const metadataPrelude = JSON.stringify(prelude)
                // underlyingStream._onBeforeFirstWrite = (write) => {
                // 	write(metadataPrelude)
                // 	write(new Uint8Array(DELIMITER_LEN))
                // }
                return underlyingStream
            }
        } as any
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
        chatAppId: chatSession.chatAppId
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

    const authDataGzipHexEncoded = simpleUser.authData ? gzipAndBase64EncodeString(JSON.stringify(simpleUser.authData)) : undefined;

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
                ...chatSession.sessionAttributes,
                currentDate: new Date().toISOString(),
                messageId: messageId,
                ...(authDataGzipHexEncoded ? { authDataGzipHexEncoded } : {})
            },
            sessionAttributes: {
                //TODO: why doesn't the definition of sessionAttributes (the type) include userId and currentDate?
                ...chatSession.sessionAttributes,
                userId: simpleUser.userId,
                chatAppId: chatSession.chatAppId,
                agentId: agentAndTools.agent.agentId,
                currentDate: new Date().toISOString()
            }
        }
    };

    let error: unknown;
    let startingTime = Date.now();
    let model: string | undefined;
	let lastModelInvocationOutputTraceContent : {
        [key:string]:unknown;
        traceId:string;
    } | undefined;
    let responseMsg = '';
    let usage: ChatMessageUsage = {
        inputTokens: 0,
        outputTokens: 0,
        inputCost: 0,
        outputCost: 0,
        totalCost: 0
    };
    let traces: CustomOrchestrationTraceMember[] = [];

    console.log('Command input built successfully');
    console.log('InvokeInlineAgentCommandInput:', JSON.stringify(cmdInput, null, 2));

    try {
        console.log('Creating InvokeInlineAgentCommand...');
        const cmd = new InvokeInlineAgentCommand(cmdInput);
        console.log('InvokeInlineAgentCommand created');
        console.log('InvokeInlineAgentCommand:', JSON.stringify(cmd, null, 2));

        console.log('Sending command to Bedrock Agent Runtime...');
        const response = await bedrockAgentClient.send(cmd);
        console.log('Bedrock Agent Runtime response received');
        console.log('InvokeInlineAgentCommandResponse', response);

        if (response.completion === undefined) {
            console.error('No completion found in response');
            throw new Error('No completion found in response');
        }

        console.log('Setting up HTTP response stream...');
        awslambda.HttpResponseStream.from(responseStream, {
            statusCode: 200,
            headers: { 'x-chatbot-session-id': chatSession.sessionId }
        });
        console.log('HTTP response stream set up with session ID:', chatSession.sessionId);

        console.log('Processing completion stream...');
        let chunkCount = 0;
        for await (const chunk of response.completion) {
            chunkCount++;
            console.log(`Processing chunk ${chunkCount}:`, {
                hasChunkBytes: !!chunk.chunk?.bytes,
                hasTrace: !!chunk.trace?.trace,
                chunkBytesLength: chunk.chunk?.bytes?.length
            });

            if (chunk.chunk?.bytes) {
                const decodedChunk = new TextDecoder().decode(chunk.chunk.bytes);
                console.log(`Chunk ${chunkCount} decoded:`, {
                    length: decodedChunk.length,
                    preview: decodedChunk.substring(0, 100)
                });
                responseMsg += decodedChunk;
                responseStream.write(decodedChunk);
                console.log(`Chunk ${chunkCount} written to response stream`);
            }

            if (chunk.trace?.trace) {
                const trace = chunk.trace.trace as CustomOrchestrationTraceMember;
                console.log(`Processing trace for chunk ${chunkCount}`);
                console.log(`Trace:`, JSON.stringify(trace, null, 2));

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
                if (!trace.orchestrationTrace) {
                    console.log(`Chunk ${chunkCount} trace has no orchestrationTrace, skipping`);
                    continue;
                }

                // Extract the model from the trace
                if (!model && trace.orchestrationTrace.modelInvocationInput?.foundationModel) {
                    model = trace.orchestrationTrace.modelInvocationInput?.foundationModel;
                    console.log('Model extracted from trace:', model);
                }

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

                    console.log(`Usage updated from trace:`, {
                        chunkInputTokens: inputTokens,
                        chunkOutputTokens: outputTokens,
                        totalInputTokens: usage.inputTokens,
                        totalOutputTokens: usage.outputTokens
                    });

                    if (trace.orchestrationTrace?.modelInvocationOutput?.rawResponse) {
                        lastModelInvocationOutputTraceContent = JSON.parse(trace.orchestrationTrace.modelInvocationOutput.rawResponse.content!);
						lastModelInvocationOutputTraceContent!.traceId = trace.orchestrationTrace.modelInvocationOutput.traceId;


                        // Don't keep the raw response in the trace
                        delete trace.orchestrationTrace?.modelInvocationOutput?.rawResponse;
                    }

                    // TODO:These are no saving to Dynamodb correctly.  The dates are not being marshalled correctly
                    if (trace.orchestrationTrace?.modelInvocationOutput?.metadata){
                        fixMetadataDates(trace.orchestrationTrace.modelInvocationOutput.metadata);
                    }
                    // TODO:These are no saving to Dynamodb correctly.  The dates are not being marshalled correctly
                    if (trace.orchestrationTrace?.observation?.actionGroupInvocationOutput?.metadata){
                        fixMetadataDates(trace.orchestrationTrace.observation.actionGroupInvocationOutput.metadata);
                    }

                    // Detect if we have been going too long and send a prompt to the user to continue
                    if (trace.failureTrace?.failureReason === "Max iterations exceeded") {
                        responseStream.write(`This one is taking me awhile to think.<prompt>Continue</prompt>`)
                    }

                    // Trim the observation to just a preview.  Observations can be large
                    let truncateSize = 30000; // TODO: THIS NEEDS TO BE A CONFIGURABLE
                    if (
                        trace.orchestrationTrace?.observation &&
                        (trace.orchestrationTrace.observation.actionGroupInvocationOutput?.text?.length ?? 0) > truncateSize
                    ) {
                        trace.orchestrationTrace.observation.actionGroupInvocationOutput!.text = trace.orchestrationTrace.observation.actionGroupInvocationOutput!.text!.substring(0, truncateSize) + " ...";
                    }

                    traces.push(trace);
                    //if (userConfig?.features?.super_admin) {
                        responseStream.write(`<trace>${JSON.stringify(trace)}</trace>`);
                    //}
                }
            }
        }
        console.log('Completion stream processing finished:', {
            totalChunks: chunkCount,
            responseLength: responseMsg.length,
            tracesCount: traces.length
        });
    } catch (e) {
        console.error('=== BEDROCK AGENT ERROR ===');
        console.error('Error invoking inline agent:', e);
        const msg = '\nOops! Something glitched on my end.';
        responseMsg += msg;
        error = e;
        responseStream.write(msg);
        console.log('Error message written to response stream');
    }

    console.log('Calculating usage costs...');
    // Make sure we get a pricing model, default to the default model
    let price = modelPricing[model || 'default'] || modelPricing.default;
    usage.inputCost = price.inputPer1000Tokens * (usage.inputTokens / 1000);
    usage.outputCost = price.outputPer1000Tokens * (usage.outputTokens / 1000);
    usage.totalCost = usage.inputCost + usage.outputCost;
    console.log('Usage costs calculated:', usage);

    console.log('Building assistant message response...');
    const assistantMessage: ChatMessageForCreate = {
        sessionId: chatSession.sessionId,
        source: 'assistant',
        userId: simpleUser.userId,
        message: responseMsg,
        executionDuration: Date.now() - startingTime,
        //TODO: need to figure out what the actual type is for the trace and whether to use my own type or the one from the SDK
        traces: convertDatesToStrings(traces) as any,
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


function fixMetadataDates(metadata:any){
    Object.entries(metadata??{}).forEach(([k,v]:[string, unknown])=>{
        if (v instanceof Date){
            metadata[k] = v.toJSON();
        }
    });
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

//TODO: need to figure out what the actual type is for the trace and whether to use my own type or the one from the SDK
interface CustomOrchestrationTraceMember {
    failureTrace?:{
        failureReason: string;
    };
    orchestrationTrace?: CustomOrchestrationTrace & {
        rationale?: {
            text: string;
        };
        modelInvocationInput?: {
            foundationModel: string;
        };
        modelInvocationOutput?: {
            traceId: string;
            rawResponse?: any;
            metadata?: {
                usage?: {
                    inputTokens: number;
                    outputTokens: number;
                };
            };
        };

        invocationInput?:{}
        observation?:{
            actionGroupInvocationOutput?:{
                text:string;
                metadata?:{};
            }
        }
    };
}
