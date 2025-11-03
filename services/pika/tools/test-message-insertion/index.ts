#!/usr/bin/env node
/**
 * Test Message Insertion Tool
 *
 * Safely deletes and re-inserts 4 specific test messages with delays
 * to trigger INSERT events for testing message replication.
 *
 * SAFETY: Only operates on exactly 4 hardcoded message IDs
 */

import { DynamoDBClient, DeleteItemCommand, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { CloudWatchLogsClient, FilterLogEventsCommand, FilterLogEventsCommandOutput } from '@aws-sdk/client-cloudwatch-logs';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const process: any;

// HARDCODED test messages - SAFETY: These are the ONLY messages that can be deleted
const TEST_MESSAGES = [
    {
        user_id: '123',
        message_id: '019a404c-2b12-77dd-a13c-ce3cdf7e7f6f:00001',
        invocation_mode: 'chat-app',
        message: "what's the weather in paris",
        session_id: '019a404c-2b12-77dd-a13c-ce3cdf7e7f6f',
        source: 'user',
        timestamp: '2025-11-01T16:42:05.336Z',
        user_type: 'internal-user'
    },
    {
        user_id: '123',
        message_id: '019a404c-2b12-77dd-a13c-ce3cdf7e7f6f:00002',
        execution_duration: 16050,
        invocation_mode: 'chat-app',
        message:
            '<weather.summary>{"location": "Paris, France", "tempC": 14.6, "tempF": 58.3, "condition": "Partly Cloudy", "windSpeed": 12.4}</weather.summary>  \n\nIt\'s a mild autumn afternoon in Paris, with partly cloudy skies. The wind is coming from the southwest at 12.4 km/h, making it a perfect day for a stroll along the Seine. Just don\'t expect to get that perfect Eiffel Tower photo with this cloud cover! \n\n<pika.prompt>Show me the weather forecast for Paris for the next 5 days</pika.prompt>\n<pika.prompt>What\'s the air quality like in Paris right now?</pika.prompt>\n<pika.prompt>Compare Paris weather with London weather today</pika.prompt>',
        session_id: '019a404c-2b12-77dd-a13c-ce3cdf7e7f6f',
        source: 'assistant',
        timestamp: '2025-11-01T16:42:21.879Z',
        traces: JSON.parse(
            '[{"orchestration_trace":{"rationale":{"text":"{\\"type\\":\\"llm-instruction\\",\\"compressedData\\":\\"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\\"}","trace_id":"llm-instruction"}}}]'
        ),
        usage: {
            input_cost: 0.059777,
            input_tokens: 23948,
            output_cost: 0.0066725000000000005,
            output_tokens: 487,
            total_cost: 0.0664495
        },
        user_type: 'internal-user',
        verifications: {
            main: 'A'
        }
    },
    {
        user_id: '123',
        message_id: '019a404c-2b12-77dd-a13c-ce3cdf7e7f6f:00003',
        invocation_mode: 'chat-app',
        message: 'Show me a chart of the last few days weather there ',
        session_id: '019a404c-2b12-77dd-a13c-ce3cdf7e7f6f',
        source: 'user',
        timestamp: '2025-11-01T16:42:34.175Z',
        user_type: 'internal-user'
    },
    {
        user_id: '123',
        message_id: '019a404c-2b12-77dd-a13c-ce3cdf7e7f6f:00004',
        execution_duration: 19162,
        invocation_mode: 'chat-app',
        message:
            'Here\'s a chart showing the temperature range and precipitation in Paris over the last week:\n  \n<pika.chart>{\n  "type": "bar",\n  "data": {\n    "labels": ["Oct 25", "Oct 26", "Oct 27", "Oct 28", "Oct 29", "Oct 30", "Oct 31", "Nov 1"],\n    "datasets": [\n      {\n        "label": "Max Temp (°C)",\n        "data": [13.9, 11.5, 15.1, 15.4, 14.5, 13.6, 16.2, 15.9],\n        "backgroundColor": "rgba(255, 99, 132, 0.5)",\n        "order": 1\n      },\n      {\n        "label": "Min Temp (°C)",\n        "data": [9.1, 7, 9.6, 10, 10.2, 7.6, 8.2, 12.1],\n        "backgroundColor": "rgba(54, 162, 235, 0.5)",\n        "order": 2\n      },\n      {\n        "label": "Precipitation (mm)",\n        "data": [3.4, 0.2, 3.4, 0, 9.4, 0, 0, 5.8],\n        "type": "line",\n        "borderColor": "rgba(75, 192, 192, 1)",\n        "fill": false,\n        "yAxisID": "precipitation",\n        "order": 0\n      }\n    ]\n  },\n  "options": {\n    "scales": {\n      "y": {\n        "title": {\n          "display": true,\n          "text": "Temperature (°C)"\n        }\n      },\n      "precipitation": {\n        "position": "right",\n        "title": {\n          "display": true,\n          "text": "Precipitation (mm)"\n        }\n      }\n    },\n    "plugins": {\n      "title": {\n        "display": true,\n        "text": "Paris Weather - Last 8 Days"\n      }\n    }\n  }\n}</pika.chart>\n\nThe past week in Paris has been quite typical for autumn, with temperatures ranging from 7°C to 16.2°C. There were a few rainy days, with the heaviest rainfall (9.4mm) occurring on October 29th. The warmest day was October 31st, reaching 16.2°C.\n\n<pika.prompt>Show me the weather forecast for the next week in Paris</pika.prompt>\n<pika.prompt>Compare this week\'s temperatures with the same week last year</pika.prompt>\n<pika.prompt>What\'s the current wind and humidity in Paris?</pika.prompt>',
        session_id: '019a404c-2b12-77dd-a13c-ce3cdf7e7f6f',
        source: 'assistant',
        timestamp: '2025-11-01T16:42:53.700Z',
        traces: JSON.parse(
            '[{"orchestration_trace":{"rationale":{"text":"{\\"type\\":\\"llm-instruction\\",\\"compressedData\\":\\"H4sIAAAAAAAAA5VXbW/byBH+rl8x4KFoQsh0kru+gHVdKLKNKkgcI1J6MO4CaE2OyK2Xu7x9kcwL/J/uN9wvK2aWpOW3tP2m5c7MPjvzzLOjSxNAWIQ0/RGFr9EutJNV7WcVap+mUxBQy6pWHbhrqRSWIJyTzgvtYWMsCC1U96vUFeyiP5TCCxC6hNaarSxpSxReGi2uFIKM4V0Gk0sTLFRGKJAOvAGh3Q7tEOfAohIeS/gloCN3B4VCYVXHwQvTtBZr1E5usf/mDZQGpIed9DUIKG0HDrVDMBuoQ2NsNpmk6dxYhBNpsfByiy5P08nkdQaQprOiCFYUMdoJeiFVnqZwwRdBELztcbyq1BtjG0HoMniLIByU7MVpAo0FOidsR8g2QTFMvqOvEYJD+0dH17NdNnnDAD47tAdz1N7KQvqODj8zRXBgNDTimnJJrnvnAgonVQdBl2ipLCWnmS4QHG6CorOH47LJ93zMhTWCLw+zvpgF0lk/1qhBtK01rZXC4xRcqCp0Hiwq3MaaK2V2B6Hdq4uxgDetMpYRuWzyA58yN5ZyrDpYehsKHyyW8Alda7Tj45gAtv8ATXAe8EawR2H4igP4j8G3wcMZ39pTGj7hL0FabFB7B1eozI5K+207rvQBjGYDFjjVhTIuWEzTHGZK3YEy0fLD5+UKrpBZp9AT4ZB9sGSySQ1HsbTHR4f9D/CiclOQulCBu8CFtjWWKF0E503DBtk+oLnRHvWAn1K0D8aNMKSGD8Jel2anI9efCc2x5/HLSlQOloMdpQLgAPqmh2VoGmG7HNZHPbkzFz8dHx0+/LJm17ORCRfWNK135NzKa5G1vD4+OtxfRad5LeyeZUHLwTAu1gz6IS6Ge+RFdSC1YzYx83zX4t+TB/iSYz5qZfrcI4ixY3uTKbUDM+t/um+fTo5aEwtimfrKUxgyGMuDN4UKvS69W348H9jM7UuElhF5Duv1WmqPdiMKHGrRX3mhiRFflSm4q3Jw3kpd/c1j057loENzhZZX83FVGF3Ke9Z1aGQpffeP0WYndblsEcvx0+16HYuTpqc3gghOzHucmK/JACbJITnHHVwae51MIWFMSQ5//mu/mCc5vHk1hWRERC7LoHVH9gOqJIc/kdWIKcnh9avb5xhH+igqRrd4rrKwq1HjFi10JkAhdP8MkWlhdCGpqbdotxJ39CxQ8YpgLdezDzWCdvGJg0puUcNweyLC0eFDLh4zbx83xTeZu9cgd6wdNPcJqd3n7TdajejI0E9n838O8XrkkcIebx7yF1xtgiqJwG1thYtvGGWtaeg52VjSlbuHq0Xr2viG8nPD+h3Fid+opkV6ELYIWyMLnFI0ueHnGS3eBY6gLvtqDS3bBOVlqx5c9LDvRTqk2389YpCBFb7GBkrZvz571xx1PWp0dp/2fbHo2/30zk3T0pBEIQaSCN83smwQlHAeOhQWhHIme6x8j2Oe3rRK9LCcUOigCkRTKhsHbq0pQ+GfCPYc+Xpx/e+MY6V9SiZ54xHJnlLp/1MSt0LJMqp/9m8HW7SOhpcfWB/3H8k1wVwzodY0Sa4pDy1aL9FlT6nUHqivCTkneaKkxmSakH+Sf02UuELlkvyn5IPokmnyLvD2u6BoNQtVcD75Eu0derLsnZI8mW0rWGEkc7AIL37/bf5yDP7Tm+n3079MX7/5cvvl9vbBQ/aMZpFNzLS7UytfY8cNsJUuCBoVLbYWHSWVjpqCt6hLN6Vpq2A+Skdlxc0mNqHqhvxcRD8Wq5HRabqSDW6saNDRmHPGw3sXx3Vjx8F80MuSZRIE9bk05ZT1lMtJsx6Np/SfwNM4zNUeglMs7gkrdIWDxNIp2T0kvxodgSw+XHz8tJqdr3I4ka5Voov+UrPSxA4ja04WtMY5eaXwORXuh55+UIOeK/0EGXtjPcxq3303bDf9OPWzPqfZS0WBJBYKDZFjshEVHtfet/nhoTMNZsGqvuJxj+1pB9L0yqiSg6Tpz3qfpC+yLHt5jyjjxLieTN6ewuzt8uP7z6vT95cwP/20mi3OYXZ+GQeJxfn8/eeT0xNYLOH1q1d/gH/N3i9O4AWSEkumDelHJNfLDBY6Nh4776RScGVRXI8yTrVEK1EXmE0m/wHU7ayVDA4AAA==\\"}","trace_id":"llm-instruction"}}}]'
        ),
        usage: {
            input_cost: 0.04776325000000001,
            input_tokens: 21169,
            output_cost: 0.01374125,
            output_tokens: 972,
            total_cost: 0.06150450000000001
        },
        user_type: 'internal-user',
        verifications: {
            main: 'A'
        }
    }
];

const ALLOWED_MESSAGE_IDS: string[] = TEST_MESSAGES.map((m) => m.message_id);

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkIfMessageExists(ddbClient: DynamoDBClient, tableName: string, userId: string, messageId: string): Promise<boolean> {
    try {
        const result = await ddbClient.send(
            new GetItemCommand({
                TableName: tableName,
                Key: marshall({ user_id: userId, message_id: messageId })
            })
        );
        return !!result.Item;
    } catch (error) {
        console.error(`Error checking if message ${messageId} exists:`, error);
        throw error;
    }
}

async function deleteMessage(ddbClient: DynamoDBClient, tableName: string, userId: string, messageId: string): Promise<void> {
    // SAFETY CHECK: Only delete allowed messages
    if (!ALLOWED_MESSAGE_IDS.includes(messageId)) {
        throw new Error(`SAFETY: Refusing to delete message ${messageId} - not in allowed list!`);
    }

    console.log(`  Deleting message: ${messageId}`);
    await ddbClient.send(
        new DeleteItemCommand({
            TableName: tableName,
            Key: marshall({ user_id: userId, message_id: messageId })
        })
    );
    console.log(`  Deleted: ${messageId}`);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insertMessage(ddbClient: DynamoDBClient, tableName: string, message: any): Promise<void> {
    // SAFETY CHECK: Only insert allowed messages
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!ALLOWED_MESSAGE_IDS.includes(message.message_id)) {
        throw new Error(`SAFETY: Refusing to insert message ${message.message_id} - not in allowed list!`);
    }

    console.log(`  Inserting message: ${message.message_id}`);
    await ddbClient.send(
        new PutItemCommand({
            TableName: tableName,
            Item: marshall(message)
        })
    );
    console.log(`  Inserted: ${message.message_id}`);
}

async function waitForReplication(logsClient: CloudWatchLogsClient, logGroupName: string | undefined, startTime: Date, expectedMessageCount: number): Promise<string[]> {
    if (!logGroupName) {
        throw new Error('MESSAGE_CHANGED_LOG_GROUP_NAME environment variable not set: e.g. /aws/lambda/pika-chat-dev-PikaConstructMessageChangedLambda816EB15-5hMgUIqetazm');
    }

    console.log(`\nStep 4: Monitoring Lambda logs for replication completion...`);
    console.log(`Log Group: ${logGroupName}`);
    console.log(`Looking for ${expectedMessageCount} "Successfully replicated message" events\n`);

    const replicatedMessages: string[] = [];
    const maxWaitTime = 60000; // 60 seconds
    const pollInterval = 2000; // 2 seconds
    const startWaitTime = Date.now();

    while (replicatedMessages.length < expectedMessageCount) {
        if (Date.now() - startWaitTime > maxWaitTime) {
            console.log(`\nTimeout: Only found ${replicatedMessages.length}/${expectedMessageCount} replicated messages`);
            break;
        }

        try {
            const response: FilterLogEventsCommandOutput = await logsClient.send(
                new FilterLogEventsCommand({
                    logGroupName: logGroupName,
                    startTime: startTime.getTime(),
                    filterPattern: '"Successfully replicated message"'
                })
            );

            if (response.events) {
                for (const event of response.events) {
                    if (event.message) {
                        // Extract message ID from log message
                        // Format: "Successfully replicated message: 019a404c-2b12-77dd-a13c-ce3cdf7e7f6f:00001 to OpenSearch"
                        const match = event.message.match(/Successfully replicated message: ([^\s]+)/);
                        if (match && match[1]) {
                            const messageId = match[1];
                            if (!replicatedMessages.includes(messageId)) {
                                replicatedMessages.push(messageId);
                                console.log(`  [${replicatedMessages.length}/${expectedMessageCount}] Replicated: ${messageId}`);
                            }
                        }
                    }
                }
            }

            if (replicatedMessages.length < expectedMessageCount) {
                await sleep(pollInterval);
            }
        } catch (error) {
            console.error(`Error querying logs:`, error);
            await sleep(pollInterval);
        }
    }

    return replicatedMessages;
}

function parseInsertOrder(orderArg?: string): number[] {
    if (!orderArg) {
        return [0, 1, 2, 3]; // Default order: 1, 2, 3, 4
    }

    const parts = orderArg.split(',').map((s) => s.trim());
    const indices: number[] = [];

    for (const part of parts) {
        const num = parseInt(part, 10);
        if (isNaN(num) || num < 1 || num > 4) {
            throw new Error(`Invalid message number: ${part}. Must be 1-4.`);
        }
        indices.push(num - 1); // Convert 1-indexed to 0-indexed
    }

    if (indices.length !== 4) {
        throw new Error(`Must specify all 4 messages. Got: ${indices.length}`);
    }

    const uniqueIndices = new Set(indices);
    if (uniqueIndices.size !== 4) {
        throw new Error(`Duplicate message numbers not allowed`);
    }

    return indices;
}

async function main() {
    // Load .env.local if present (located at services/pika/.env.local)
    const envPath = path.join(__dirname, '..', '..', '.env.local');
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log(`Loaded environment variables from ${envPath}`);
    }

    // Ensure required env vars are present
    const requiredEnv = ['stage', 'AWS_REGION', 'PIKA_SERVICE_PROJ_NAME_KEBAB_CASE'] as const;
    const missingEnv = requiredEnv.filter((key) => !process.env[key]);
    if (missingEnv.length > 0) {
        console.error(`\nMissing required environment variables: ${missingEnv.join(', ')}`);
        console.error('\nMake sure .env.local exists with:');
        console.error('  stage=<your-stage>');
        console.error('  AWS_REGION=<your-region>');
        console.error('  PIKA_SERVICE_PROJ_NAME_KEBAB_CASE=<your-project-name>');
        console.error('  PIKA_DOMAIN_ENDPOINT=<your-opensearch-endpoint>');
        console.error('  MESSAGE_CHANGED_LOG_GROUP_NAME=<lambda-log-group> (optional, for CloudWatch monitoring)\n');
        process.exit(1);
    }

    const stage = process.env.stage;
    const projectName = process.env.PIKA_SERVICE_PROJ_NAME_KEBAB_CASE;
    const region = process.env.AWS_REGION;

    // Construct table name
    const TABLE_NAME = `chat-message-${projectName}-${stage}`;

    // Get log group name from env (optional - CloudWatch monitoring will be skipped if not set)
    const LOG_GROUP_NAME = process.env.MESSAGE_CHANGED_LOG_GROUP_NAME;

    // Initialize clients with proper region
    const ddbClient = new DynamoDBClient({ region });
    const logsClient = new CloudWatchLogsClient({ region });

    // Parse command-line arguments
    const args = process.argv.slice(2);
    let insertOrder: number[] = [0, 1, 2, 3];

    if (args.length > 0) {
        try {
            insertOrder = parseInsertOrder(args[0]);
        } catch (error) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            console.error(`\nERROR: ${error.message}`);
            console.error(`\nUsage: npx tsx tools/test-message-insertion/index.ts [order]`);
            console.error(`Example: npx tsx tools/test-message-insertion/index.ts "1,4,2,3"`);
            console.error(`         (inserts messages in order: 1, 4, 2, 3)\n`);
            process.exit(1);
        }
    }
    console.log('='.repeat(80));
    console.log('Test Message Insertion Tool');
    console.log('='.repeat(80));
    console.log(`Stage: ${stage}`);
    console.log(`Project: ${projectName}`);
    console.log(`Region: ${region}`);
    console.log(`Table: ${TABLE_NAME}`);
    console.log(`Log Group: ${LOG_GROUP_NAME || '(not set - CloudWatch monitoring disabled)'}`);
    console.log(`\nSAFETY: This tool ONLY operates on these 4 message IDs:`);
    ALLOWED_MESSAGE_IDS.forEach((id) => console.log(`  - ${id}`));

    const insertOrderDisplay = insertOrder.map((idx) => idx + 1).join(' → ');
    console.log(`\nInsert Order: ${insertOrderDisplay}`);
    console.log('='.repeat(80));
    console.log('');

    // Step 1: Check which messages exist
    console.log('Step 1: Checking which messages exist...\n');
    const existingMessages: string[] = [];
    for (const message of TEST_MESSAGES) {
        const exists = await checkIfMessageExists(ddbClient, TABLE_NAME, message.user_id, message.message_id);
        if (exists) {
            existingMessages.push(message.message_id);
            console.log(`  ✓ EXISTS: ${message.message_id}`);
        } else {
            console.log(`  - NOT FOUND: ${message.message_id}`);
        }
    }

    // Step 2: Delete existing messages
    if (existingMessages.length > 0) {
        console.log(`\nStep 2: Deleting ${existingMessages.length} existing messages...\n`);
        for (const message of TEST_MESSAGES) {
            if (existingMessages.includes(message.message_id)) {
                await deleteMessage(ddbClient, TABLE_NAME, message.user_id, message.message_id);
            }
        }
        console.log('\nAll existing messages deleted');
    } else {
        console.log('\nStep 2: No existing messages to delete');
    }

    // Step 3: Insert messages with 5 second gaps
    const replicationStartTime = new Date();
    console.log('\nStep 3: Inserting messages with 5-second delays...\n');
    for (let i = 0; i < insertOrder.length; i++) {
        const idx = insertOrder[i];
        const message = TEST_MESSAGES[idx];
        await insertMessage(ddbClient, TABLE_NAME, message);

        if (i < insertOrder.length - 1) {
            console.log(`  ⏱️  Waiting 5 seconds before next insert...\n`);
            await sleep(5000);
        }
    }

    console.log('\nAll 4 messages inserted');

    // Step 4: Wait for replication and check order (optional - logs monitoring)
    console.log('\nStep 4: Monitoring Lambda logs (optional)...');
    try {
        const replicatedMessages = await waitForReplication(logsClient, LOG_GROUP_NAME, replicationStartTime, 4);

        if (replicatedMessages.length > 0) {
            console.log('\n--- Replication Order from Logs ---');
            replicatedMessages.forEach((msgId, idx) => {
                const msgNum = msgId.split(':')[1];
                console.log(`  ${idx + 1}. Message ${msgNum} (${msgId})`);
            });

            console.log('\n--- Insert Order vs Replication Order ---');
            const insertedOrder = insertOrder.map((idx) => `Message ${idx + 1}`).join(' → ');
            const replicatedOrder = replicatedMessages.map((msgId) => `Message ${msgId.split(':')[1]}`).join(' → ');
            console.log(`  Inserted:   ${insertedOrder}`);
            console.log(`  Replicated: ${replicatedOrder}`);

            if (insertedOrder === replicatedOrder) {
                console.log(`  Order preserved`);
            } else {
                console.log(`   Order changed during replication`);
            }
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`\n  Could not monitor Lambda logs: ${errorMsg}`);
        console.log('   This is optional - verify replication by checking OpenSearch directly.');
        if (!LOG_GROUP_NAME) {
            console.log(
                '   Tip: Set MESSAGE_CHANGED_LOG_GROUP_NAME in .env.local to enable log monitoring: e.g. /aws/lambda/pika-chat-dev-PikaConstructMessageChangedLambda816EB15-5hMgUIqetazm'
            );
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('SUCCESS: Messages inserted into DynamoDB');
    console.log('='.repeat(80));
    console.log('\nUse this command to verify replication:');
    console.log(`  npx tsx tools/os/os-tools.ts verify ${TEST_MESSAGES[0].message_id}`);
    console.log('');
}

main().catch((error) => {
    console.error('\n' + '='.repeat(80));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    console.error('ERROR:', error.message);
    console.error('='.repeat(80));
    console.error(error);
    process.exit(1);
});
