import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { Context } from "aws-lambda";
import { getMessagesFrom, getSessions, updateSessionLastAnalysedMessage } from "../../lib/chat-admin-ddb";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { getRegion } from "../../lib/utils";
import { dirname } from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

interface AnalyzeEvent { }

const sessionSettleDurationMS = 1000 * 60 * 1; // 1 minute

const instructions = readFileSync("./analyze-session-instructions-v2.md").toString();
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
	json?: T
	jsons: A
}

interface SessionScore {
	scores: {
		goal_achievement: {
			score: number;
			description: string;
		},
		user_satisfaction: {
			score: number;
			description: string;
		},
		ai_performance: {
			accuracy: {
				score: number;
				description: string;
			},
			helpfulness: {
				score: number;
				description: string;
			},
			communication: {
				score: number;
				description: string;
			},
			efficiency: {
				score: number;
				description: string;
			},
			overall: {
				score: number;
				description: string;
			}
		},
		interaction_quality: {
			score: number;
			description: string;
		}
	},
	assessments: {
		user_sentiment: "positive" | "neutral" | "negative";
		goal_completion_status: "completed" | "partially_completed" | "not_completed";
		satisfaction_level: "satisfied" | "neutral" | "dissatisfied";
		requires_followup: boolean;
		critical_issues_present: boolean;
		escalation_needed: boolean;
	},
	metrics: {
		session_duration_estimate: "short" | "medium" | "long",
		complexity_level: "low" | "medium" | "high",
		user_effort_required: "low" | "medium" | "high",
		ai_confidence_level: "low" | "medium" | "high"
	}
}

export async function handler(event: AnalyzeEvent, context: Context) {

	let lastRun = new Date("2020-01-01").valueOf();
	let now = Date.now();

	let lastKey = undefined;
	let counts = {
		sessions: 0,
		toProcess: 0,
		errors: 0
	};
	let userPrompts: Record<string, string[]> = {};
	function addUserPrompt(agent: string, prompt: string) {
		if (!(agent in userPrompts)) {
			userPrompts[agent] = [];
		}
		userPrompts[agent].push(prompt);
	}
	do {
		let sessions = await getSessions(lastKey);

		for (let session of sessions.Items ?? []) {
			counts.sessions++;
			let lastUpdate = new Date(session.lastUpdate).valueOf();
			let lastMessageId = session.lastMessageId ?? "";
			let lastAnalyzedMessageId = session.lastAnalyzedMessageId ?? "";

			// Only analyze the session if it has new messages and has passed the time limit
			if (
				//lastUpdate - sessionSettleDurationMS > lastRun &&
				lastUpdate + sessionSettleDurationMS < now &&
				lastAnalyzedMessageId < lastMessageId
			) {
				try {
					// New Messages to analyze
					console.log(`Session: ${session.chatAppId}:${session.userId}:${session.sessionId}, lm: ${lastMessageId}, lam: ${lastAnalyzedMessageId}`);
					let messages = await getMessagesFrom(session.userId, session.sessionId, lastAnalyzedMessageId, false);

					// Simplify messages and traces
					if (messages.Items?.length) {
						let firstAnalyzedMessage = messages.Items[0].messageId;
						lastAnalyzedMessageId = messages.Items[messages.Items.length - 1].messageId;
						let context: Record<string, any> = {
							chat_messages: messages.Items.map(m => {
								if (m.source == "user") {
									addUserPrompt(session.agentId, m.message)
								}
								return {
									role: m.source,
									content: m.message,
									thinking: m.traces?.map(t => {

										// Only include rationale and failures (except the interations error)
										if (t.orchestrationTrace?.rationale?.text) {
											return t.orchestrationTrace?.rationale.text;
										} else if (t.failureTrace?.failureReason && t.failureTrace?.failureReason != "Max iterations exceeded") {
											return t.failureTrace?.failureReason;
										}

									}).filter(a => !!a)
								}
							})
						};


						// replace the prompt variables
						let prompt = instructions.replace(/{{(.+)}}/g, (str, variableName) => {
							let v = context[variableName];
							if (v != null) {
								if (typeof v === "object") {
									return JSON.stringify(v)
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
						let responseBody = await invokeModel<SessionScore>(MODEL, prompt);
						let scoring = responseBody.json;
						let key = `session-analysis/${session.chatAppId}/${session.userId}/${lastAnalyzedMessageId}.md`;
						let fileKey = key;
						if (scoring != null) {
							// let rawResponseContent = responseBody.content[0].text;

							// // Try and pull out the scoring json data from the response
							// let scoringStr = rawResponseContent.match(/<json>((?:.|\n|\r)*?)<\/json>/)?.[1];
							// scoring = scoringStr ? JSON.parse(scoringStr) : undefined;

							// Save the analysis

							if (process.env.IS_LOCAL) {
								let file = `./out/${process.env.UPLOAD_S3_BUCKET}/${key}`.replace(":", "_");
								mkdirSync(dirname(file), { recursive: true });
								writeFileSync(file, responseBody.content);
							}
							await s3Client.send(new PutObjectCommand({
								Bucket: process.env.UPLOAD_S3_BUCKET,
								Key: key,
								Body: JSON.stringify({
									model: responseBody.model,
									usage: responseBody.usage,
									scoring: scoring,
									content: responseBody.content,
								})
							}));
						} else {
							console.error("***NO RESPONSE***", session.userId, session.sessionId)
						}

						let requiresFollowup = false;
						if (scoring) {
							let notes = [];
							let urgent = []
							if (scoring.assessments.critical_issues_present || scoring.assessments.requires_followup || scoring.assessments.escalation_needed) {
								urgent.push("EMPLOYEE FOLLOWUP REQUIRED");
							}
							if (scoring.metrics.ai_confidence_level == "low") {
								urgent.push("LOW AI CONFIDENCE LEVEL");
							}
							if (scoring.metrics.complexity_level == "high") {
								notes.push("HIGH COMPLEXITY LEVEL");
							}
							if (scoring.assessments.satisfaction_level == "dissatisfied" || scoring.assessments.user_sentiment == "negative") {
								urgent.push("USER SATISFACTION ISSUE");
							}

							if (scoring.assessments.goal_completion_status == "not_completed") {
								urgent.push("USER UNABLE TO COMPLETE GOALS");
							}


							if (notes.length || urgent.length) {
								let summary = [
									`************************ FLAGGED SESSION`,
									`AGENT: ${session.agentId}`,
									`TITLE: ${session.title}`,
									`USER: ${session.userId}`,
									`SESSION: ${session.sessionId}`,
									`Messages: ${firstAnalyzedMessage} - ${lastAnalyzedMessageId}`,
									`Key: ${fileKey}`,
									"------------------------",
									...urgent,
									...notes,
									"************************"
								];
								console.log(summary.join("\n"), JSON.stringify(scoring, null, 2));
								if (urgent.length) {
									// TODO: NOTIFY SOMEONE THAT ACTION IS NEEDED
									console.log("Urgent Action needed for session", session.agentId, session.userId, session.sessionId);
									requiresFollowup = true;
								}
							}
						}

						await updateSessionLastAnalysedMessage(session.userId, session.sessionId, lastAnalyzedMessageId, session.flagged || requiresFollowup);
					}


					counts.toProcess++;
				} catch (e) {
					console.error(`ERROR analyzing session: ${session.sessionId}`, e);
					counts.errors++;
				}

			} else if (lastAnalyzedMessageId) {
				await updateSessionLastAnalysedMessage(session.userId, session.sessionId, lastAnalyzedMessageId, session.flagged);
			}
		}
		lastKey = sessions.LastEvaluatedKey;
	} while (!!lastKey);
	console.log(counts);

	// Get suggestion prompts for agents
	//let agentSuggestionsResponse = await invokeModel(MODEL, ``);



	// 1) Scan sessions 
	//   a) filter to sessions that have been updated from the last run
	// 2) Analyze each session
	//   a) What was the user's goals in the session?
	//   b) Were they able to accomplish those goals?
	//   c) What was the users sentiment for the session?
	//   d) In what areas does the agent need to inprove?
	//   e) Suggestions on how to inprove
	//   f) Was the user sastified?
	//   g) What could we do to better help the user accomplish their goals?
	//   h) Do we need to contact the customer to (help them | fix the relationship | set expectation)?
	//   i) Were their any features suggested to improve their experiance?
	//   j) Are there critical things that need to be resolved quickly?




	// In real time should we be looking/asking if the user needs help or if there are ways to improve?  (eg.  inline feedback)

}


async function invokeModel<T = unknown>(model: string, prompt: string, params?: {
	anthropic_version?: string;
	max_tokens?: number;
	top_k?: number;
	temperature?: number;
	top_p?: number;
	messages: {
		role: string;
		content: {
			type: "text",
			text: string;
		}[]
	}[]
}) {
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
			...params,
		}),
		contentType: "application/json",
		accept: "application/json",
		//trace: "ENABLED"
	});
	let response = await bedrockClient.send(c);

	// Parse the model response
	const responseBody: ModelResponseRaw<T> = JSON.parse(new TextDecoder().decode(response.body));
	//console.log("Model Response:", responseBody);

	// Try and pull out the scoring json data from the response
	let rawResponseContent = responseBody.content[0].text;
	let jsons = (rawResponseContent.match(/<json>((?:.|\n|\r)*?)<\/json>/g) ?? []).map(j => JSON.parse(j.replace(/(^<json>|<\/json>$)/g, "")));

	return {
		...responseBody,
		content: rawResponseContent,
		json: jsons[0],
		jsons: jsons,
	};

}
