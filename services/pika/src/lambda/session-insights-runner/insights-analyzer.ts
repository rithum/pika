import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
    ChatSession,
    ChatSessionFeedback,
    ChatSessionLiteForUpdate,
    RecordOrUndef,
    SessionInsights,
    SessionInsightScoring,
    SessionInsightUsage
} from '@pika/shared/types/chatbot/chatbot-types';
import { SnakeCase } from '@pika/shared/util/chatbot-shared-utils';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { getChatMessagesInSession } from 'src/lib/chat-ddb';
import { v7 as uuidv7 } from 'uuid';
import { getRegion } from '../../lib/utils';

interface AnalyzeEvent {}

const sessionSettleDurationMS = 1000 * 60 * 1; // 1 minute

const instructions = readFileSync('./analyze-session-instructions-v2.md').toString();
const bedrockClient = new BedrockRuntimeClient({ region: getRegion() });

const s3Client = new S3Client({});

const DEFAULT_ANTHROPIC_VERSION = 'bedrock-2023-05-31';
const DEFAULT_MODEL = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';
const FAST_MODEL = 'anthropic.claude-3-haiku-20240307-v1:0'; //'amazon.nova-micro-v1:0';
const MODEL = DEFAULT_MODEL;

interface ModelResponseRaw<T = unknown, A extends Array<unknown> = T[]> {
    id: string;
    type: string;
    role: string;
    model: string;
    content: {
        type: string;
        text: string;
    }[];
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}

interface ModelResponse<T = unknown, A extends Array<unknown> = T[]> {
    id: string;
    type: string;
    role: string;
    model: string;
    content: string;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
    json?: T;
    jsons: A;
}

/**
 * Get suggestion prompts for agents
 * let agentSuggestionsResponse = await invokeModel(MODEL, ``);
 *
 * Analyze each session
 *   a) What was the user's goals in the session?
 *   b) Were they able to accomplish those goals?
 *   c) What was the users sentiment for the session?
 *   d) In what areas does the agent need to inprove?
 *   e) Suggestions on how to inprove
 *   f) Was the user sastified?
 *   g) What could we do to better help the user accomplish their goals?
 *   h) Do we need to contact the customer to (help them | fix the relationship | set expectation)?
 *   i) Were their any features suggested to improve their experiance?
 *   j) Are there critical things that need to be resolved quickly?
 *
 * In real time should we be looking/asking if the user needs help or if there are ways to improve?  (eg.  inline feedback)
 *
 * @param session The session to be analyzed
 * @param sessionBatch If needed, add updates to be performed on the session to this batch
 * @param feedbackBatch If needed, add feedback to be added on the session to this batch
 */
export async function analyzeSession(session: ChatSession<RecordOrUndef>, sessionBatch: ChatSessionLiteForUpdate[], feedbackBatch: ChatSessionFeedback[]) {
    // If you change the insights instructions, you need to increment this version.
    // The instructions file are versioned according to this version: instructions/insights-instructions-v{version}.md
    const insightsVersion = 2;
    // Key is agentId, value is array of user prompts
    let userPrompts: Record<string, string[]> = {};
    let lastMessageId = session.lastMessageId ?? '';
    let lastAnalyzedMessageId: string | undefined;

    try {
        // Analyze all messages in the session
        console.log(`Session: ${session.chatAppId}:${session.userId}:${session.sessionId}, lm: ${lastMessageId}`);
        let messages = await getChatMessagesInSession(session.userId, session.sessionId);

        // Simplify messages and traces
        if (messages.length) {
            let firstAnalyzedMessage = messages[0].messageId;
            lastAnalyzedMessageId = messages[messages.length - 1].messageId;
            let context: Record<string, any> = {
                chat_messages: messages.map((m) => {
                    if (m.source == 'user') {
                        if (!(session.agentId in userPrompts)) {
                            userPrompts[session.agentId] = [];
                        }
                        userPrompts[session.agentId].push(m.message);
                    }
                    return {
                        role: m.source,
                        content: m.message,
                        thinking: m.traces
                            ?.map((t) => {
                                // Only include rationale and failures (except the interations error)
                                if (t.orchestrationTrace?.rationale?.text) {
                                    return t.orchestrationTrace?.rationale.text;
                                } else if (t.failureTrace?.failureReason && t.failureTrace?.failureReason != 'Max iterations exceeded') {
                                    return t.failureTrace?.failureReason;
                                }
                            })
                            .filter((a) => !!a)
                    };
                })
            };

            // replace the prompt variables
            let prompt = instructions.replace(/{{(.+)}}/g, (str, variableName) => {
                let v = context[variableName];
                if (v != null) {
                    if (typeof v === 'object') {
                        return JSON.stringify(v);
                    }

                    return v;
                }
                return str;
            });

            // Invoke model
            // let c = new InvokeModelCommand({
            // 	modelId: MODEL,
            // 	body: JSON.stringify({
            // 		anthropic_version: DEFAULT_ANTHROPIC_VERSION,
            // 		max_tokens: 10000,
            // 		top_k: 250,
            // 		temperature: 1,
            // 		top_p: 0.999,
            // 		messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
            // 	}),
            // 	contentType: "application/json",
            // 	accept: "application/json",
            // 	//trace: "ENABLED"
            // });
            // let response = await bedrockClient.send(c);

            // // Parse the model response
            // const responseBody: ModelResponse = JSON.parse(new TextDecoder().decode(response.body));
            // //console.log("Model Response:", responseBody);
            let responseBody = await invokeModel<SnakeCase<SessionInsightScoring>>(MODEL, prompt);
            let scoring = responseBody.json as SnakeCase<SessionInsightScoring>;

            //TODO: figure out how to make this a json file and conform to SessionInsights interface
            let key = `session-insights/${session.chatAppId}/${session.userId}/${lastAnalyzedMessageId}.json`;
            const insightsS3Url = `s3://${process.env.PIKA_S3_BUCKET}/${key}`;
            if (scoring != null) {
                // let rawResponseContent = responseBody.content[0].text;

                // // Try and pull out the scoring json data from the response
                // let scoringStr = rawResponseContent.match(/<json>((?:.|\n|\r)*?)<\/json>/)?.[1];
                // scoring = scoringStr ? JSON.parse(scoringStr) : undefined;

                // Save the analysis

                if (process.env.IS_LOCAL) {
                    const file = `./out/${process.env.PIKA_S3_BUCKET}/${key}`.replace(':', '_');
                    mkdirSync(dirname(file), { recursive: true });
                    writeFileSync(file, responseBody.content);
                }

                const sessionInsights: SnakeCase<SessionInsights> = {
                    model: responseBody.model,
                    version: String(insightsVersion),
                    usage: responseBody.usage as SnakeCase<SessionInsightUsage>,
                    scoring,
                    detail_markdown: responseBody.content
                };

                await s3Client.send(
                    new PutObjectCommand({
                        Bucket: process.env.PIKA_S3_BUCKET,
                        Key: key,
                        Body: JSON.stringify(sessionInsights)
                    })
                );

                sessionBatch.push({
                    userId: session.userId,
                    sessionId: session.sessionId,
                    lastAnalyzedMessageId,
                    insightStatus: null, // remove the insight status as we have computed the insights
                    insightsS3Url
                });

                addFeedback(scoring, session, firstAnalyzedMessage, lastAnalyzedMessageId, insightsS3Url, feedbackBatch);
            } else {
                console.error('***NO RESPONSE***', session.userId, session.sessionId);
            }
        }
    } catch (e) {
        console.error(`ERROR analyzing session: ${session.sessionId}`, e);
    }
}

async function invokeModel<T = unknown>(
    model: string,
    prompt: string,
    params?: {
        anthropic_version?: string;
        max_tokens?: number;
        top_k?: number;
        temperature?: number;
        top_p?: number;
        messages: {
            role: string;
            content: {
                type: 'text';
                text: string;
            }[];
        }[];
    }
) {
    // Invoke model
    let c = new InvokeModelCommand({
        modelId: model,
        body: JSON.stringify({
            anthropic_version: DEFAULT_ANTHROPIC_VERSION,
            max_tokens: 10000,
            top_k: 250,
            temperature: 1,
            top_p: 0.999,
            messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
            ...params
        }),
        contentType: 'application/json',
        accept: 'application/json'
        //trace: "ENABLED"
    });
    let response = await bedrockClient.send(c);

    // Parse the model response
    const responseBody: ModelResponseRaw<T> = JSON.parse(new TextDecoder().decode(response.body));
    //console.log("Model Response:", responseBody);

    // Try and pull out the scoring json data from the response
    let rawResponseContent = responseBody.content[0].text;
    let jsons = (rawResponseContent.match(/<json>((?:.|\n|\r)*?)<\/json>/g) ?? []).map((j) => JSON.parse(j.replace(/(^<json>|<\/json>$)/g, '')));

    return {
        ...responseBody,
        content: rawResponseContent,
        json: jsons[0],
        jsons: jsons
    };
}

export function addFeedback(
    scoring: SnakeCase<SessionInsightScoring>,
    session: ChatSession<RecordOrUndef>,
    firstAnalyzedMessage: string,
    lastAnalyzedMessageId: string,
    insightsS3Url: string,
    feedbackBatch: ChatSessionFeedback[]
) {
    const feedbackUserId = `ai-feedback-user`;
    if (scoring) {
        let notes = [];
        let urgent = [];
        const now = new Date().toISOString();
        let feedbackCount = 0;

        // Check for critical issues and create appropriate feedback
        if (scoring.assessments.critical_issues_present || scoring.assessments.requires_followup || scoring.assessments.escalation_needed) {
            urgent.push('EMPLOYEE FOLLOWUP REQUIRED');
            feedbackBatch.push({
                sessionId: session.sessionId,
                feedbackId: uuidv7(),
                userId: feedbackUserId,
                messageId: lastAnalyzedMessageId,
                reportedByHuman: false,
                createdByCustomer: false,
                status: 'open',
                severity: 'critical',
                type: 'critical_issues_present',
                userComment: `AI analysis detected critical issues: escalation_needed=${scoring.assessments.escalation_needed}, requires_followup=${scoring.assessments.requires_followup}, critical_issues_present=${scoring.assessments.critical_issues_present}`,
                createdOn: now,
                updatedOn: now
            });
            feedbackCount++;
        }

        if (scoring.metrics.ai_confidence_level == 'low') {
            urgent.push('LOW AI CONFIDENCE LEVEL');
            feedbackBatch.push({
                sessionId: session.sessionId,
                feedbackId: uuidv7(),
                userId: feedbackUserId,
                messageId: lastAnalyzedMessageId,
                reportedByHuman: false,
                createdByCustomer: false,
                status: 'open',
                severity: 'medium',
                type: 'low_ai_confidence_level',
                userComment: `AI confidence level was low during session analysis`,
                createdOn: now,
                updatedOn: now
            });
            feedbackCount++;
        }

        if (scoring.metrics.complexity_level == 'high') {
            notes.push('HIGH COMPLEXITY LEVEL');
            feedbackBatch.push({
                sessionId: session.sessionId,
                feedbackId: uuidv7(),
                userId: feedbackUserId,
                messageId: lastAnalyzedMessageId,
                reportedByHuman: false,
                createdByCustomer: false,
                status: 'open',
                severity: 'low',
                type: 'high_complexity_session',
                userComment: `High complexity session - may be useful for training`,
                createdOn: now,
                updatedOn: now
            });
            feedbackCount++;
        }

        if (scoring.assessments.satisfaction_level == 'dissatisfied' || scoring.assessments.user_sentiment == 'negative') {
            urgent.push('USER SATISFACTION ISSUE');
            feedbackBatch.push({
                sessionId: session.sessionId,
                feedbackId: uuidv7(),
                userId: feedbackUserId,
                messageId: lastAnalyzedMessageId,
                reportedByHuman: false,
                createdByCustomer: false,
                status: 'open',
                severity: 'high',
                type: 'user_dissatisfied',
                userComment: `User satisfaction issue detected: satisfaction_level=${scoring.assessments.satisfaction_level}, user_sentiment=${scoring.assessments.user_sentiment}`,
                createdOn: now,
                updatedOn: now
            });
            feedbackCount++;
        }

        if (scoring.assessments.goal_completion_status == 'not_completed') {
            urgent.push('USER UNABLE TO COMPLETE GOALS');
            feedbackBatch.push({
                sessionId: session.sessionId,
                feedbackId: uuidv7(),
                userId: feedbackUserId,
                messageId: lastAnalyzedMessageId,
                reportedByHuman: false,
                createdByCustomer: false,
                status: 'open',
                severity: 'high',
                type: 'goal_misalignment',
                userComment: `User was unable to complete their goals during the session`,
                createdOn: now,
                updatedOn: now
            });
            feedbackCount++;
        }

        if (notes.length || urgent.length) {
            let summary = [
                `************************ FLAGGED SESSION`,
                `AGENT: ${session.agentId}`,
                `TITLE: ${session.title}`,
                `USER: ${session.userId}`,
                `SESSION: ${session.sessionId}`,
                `Messages: ${firstAnalyzedMessage} - ${lastAnalyzedMessageId}`,
                `S3 URL: ${insightsS3Url}`,
                `Feedback records created: ${feedbackCount}`,
                '------------------------',
                ...urgent,
                ...notes,
                '************************'
            ];
            console.log(summary.join('\n'), JSON.stringify(scoring, null, 2));
            if (urgent.length) {
                console.log('Urgent Action needed for session', session.agentId, session.userId, session.sessionId);
            }
        }
    }
}
