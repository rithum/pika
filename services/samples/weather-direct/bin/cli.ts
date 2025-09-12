#!/usr/bin/env node
import { Sha256 } from '@aws-crypto/sha256-js';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { SignatureV4 } from '@smithy/signature-v4';
import { Command } from 'commander';
import * as jwt2 from 'jsonwebtoken';
import { SimpleAuthenticatedUser } from 'pika-shared/types/chatbot/chatbot-types';
import { getLoggedInAccountIdFromSts } from './sts';

interface DirectInvokeRequest {
    invocationMode: 'direct-agent-invoke';
    message: string;
    agentId: string;
    userId: string;
    features?: {
        verifyResponse?: { enabled: boolean };
        instructionAugmentation?: { enabled: boolean };
        tags?: { tagsEnabled: any[] };
    };
}

async function getParameterFromSSM(parameterName: string, region: string): Promise<string> {
    const client = new SSMClient({ region });
    try {
        const response = await client.send(
            new GetParameterCommand({
                Name: parameterName,
                WithDecryption: true
            })
        );

        if (!response.Parameter?.Value) {
            throw new Error(`Parameter ${parameterName} not found or has no value`);
        }

        return response.Parameter.Value;
    } catch (error) {
        throw new Error(`Failed to get parameter ${parameterName}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function invokeConverseFunction(functionUrl: string, request: DirectInvokeRequest, jwtToken: string, region: string): Promise<void> {
    console.log(`Invoking agent: ${request.agentId}`);
    console.log(`Message: ${request.message}`);
    console.log(`Function URL: ${functionUrl}`);
    console.log('');

    try {
        // Parse the Function URL to get hostname and path
        const url = new URL(functionUrl);

        // Prepare the request object for AWS IAM signing
        const requestToSign = {
            method: 'POST',
            hostname: url.hostname,
            path: url.pathname + url.search,
            protocol: url.protocol,
            headers: {
                Host: url.hostname,
                'Content-Type': 'application/json',
                'x-chat-auth': `Bearer ${jwtToken}`
            } as Record<string, string>,
            body: JSON.stringify(request)
        };

        // Create a SignatureV4 signer instance for Lambda service
        const signer = new SignatureV4({
            credentials: defaultProvider(),
            region: region,
            service: 'lambda', // Lambda Function URLs use 'lambda' service for signing
            sha256: Sha256
        });

        // Sign the request with AWS IAM credentials
        const signedRequest = (await signer.sign(requestToSign as any)) as unknown as {
            method: string;
            headers: Record<string, string>;
            body: string;
        };

        // Make the fetch call using the signed request
        const response = await fetch(functionUrl, {
            method: signedRequest.method,
            headers: signedRequest.headers,
            body: signedRequest.body
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        if (!response.body) {
            throw new Error('No response body received');
        }

        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        console.log('Response:');
        console.log('────────────');

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process complete JSON objects
                let newlineIndex;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.slice(0, newlineIndex).trim();
                    buffer = buffer.slice(newlineIndex + 1);

                    if (line) {
                        try {
                            const data = JSON.parse(line);
                            if (data.content) {
                                process.stdout.write(data.content);
                            } else if (data.error) {
                                console.error('\nError:', data.error);
                            }
                        } catch (parseError) {
                            // Might be plain text or partial JSON, just print it
                            process.stdout.write(line);
                        }
                    }
                }
            }

            // Process any remaining buffer content
            if (buffer.trim()) {
                try {
                    const data = JSON.parse(buffer);
                    if (data.content) {
                        process.stdout.write(data.content);
                    }
                } catch {
                    process.stdout.write(buffer);
                }
            }
        } finally {
            reader.releaseLock();
        }

        console.log('\n────────────');
        console.log('Done');
    } catch (error) {
        console.error('Failed to invoke converse function:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

function createJWT(user: SimpleAuthenticatedUser<undefined>, jwtSecret: string): string {
    return jwt2.sign(user, jwtSecret, { expiresIn: '1h' });
}

async function main() {
    const program = new Command();

    program
        .name('weather-direct-cli')
        .description('CLI tool for direct weather agent invocation')
        .version('1.0.0')
        .argument('<message>', 'message to send to the weather agent')
        .option('-s, --stage <stage>', 'deployment stage', 'test')
        .option('-u, --user-id <userId>', 'user ID for the request', '123')
        .option('-r, --region <region>', 'AWS region', 'us-east-1')
        .option('--pika-service <name>', 'pika service project name', 'pika')
        .option('--agent-service <name>', 'weather agent service name', 'weather-direct')
        .option('--verbose', 'verbose output')
        .action(async (message, options) => {
            try {
                const { stage, userId, region, pikaService, agentService, verbose } = options;

                if (verbose) {
                    console.log('Options:', { stage, userId, region, pikaService, agentService });
                }

                // Get account ID
                const accountId = await getLoggedInAccountIdFromSts();
                if (verbose) console.log(`Account ID: ${accountId}`);

                // Get converse function URL from SSM
                const converseFunctionUrlParam = `/stack/${pikaService}/${stage}/function/converse_url`;
                console.log(`Getting converse function URL from SSM: ${converseFunctionUrlParam}`);
                const converseFunctionUrl = await getParameterFromSSM(converseFunctionUrlParam, region);

                // Get agent ID from SSM
                const agentIdParam = `/stack/${agentService}/${stage}/agent_id`;
                console.log(`Getting agent ID from SSM: ${agentIdParam}`);
                const agentId = await getParameterFromSSM(agentIdParam, region);

                // Get JWT secret from SSM
                const jwtSecretParam = `/stack/${pikaService}/${stage}/jwt-secret`;
                console.log(`Getting JWT secret from SSM: ${jwtSecretParam}`);
                const jwtSecret = await getParameterFromSSM(jwtSecretParam, region);

                const user: SimpleAuthenticatedUser<undefined> = {
                    userId,
                    customUserData: undefined
                };
                ``;

                // Create JWT token
                const jwtToken = createJWT(user, jwtSecret);
                if (verbose) console.log(`JWT created for user: ${userId}`);

                // Create the direct invocation request
                const request: DirectInvokeRequest = {
                    invocationMode: 'direct-agent-invoke',
                    message,
                    agentId,
                    userId,
                    features: {
                        verifyResponse: { enabled: true },
                        instructionAugmentation: { enabled: true },
                        tags: { tagsEnabled: [] }
                    }
                };

                if (verbose) {
                    console.log('Request:', JSON.stringify(request, null, 2));
                }

                // Invoke the converse function
                await invokeConverseFunction(converseFunctionUrl, request, jwtToken, region);
            } catch (error) {
                console.error('CLI Error:', error instanceof Error ? error.message : String(error));
                process.exit(1);
            }
        });

    program.parse();
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

if (require.main === module) {
    main().catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
