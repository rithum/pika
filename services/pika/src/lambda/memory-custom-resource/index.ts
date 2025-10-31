import { BedrockAgentCoreControlClient, CreateMemoryCommand, GetMemoryCommand, Memory } from '@aws-sdk/client-bedrock-agentcore-control';
import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceResponse } from 'aws-lambda';
import { getMemoryNamespaceForStrategy } from 'src/lib/utils';
import { sendCustomResourceResponse } from '../../lib/lambda-custom-resource-util';
import { parseMemoryCustomResourceProperties } from './util';

const bedrockClient = new BedrockAgentCoreControlClient({});
const ssmClient = new SSMClient({});

// Helper function to map strategy names back to original strategy names
const mapStrategyNameToKey = (strategyName: string): string | undefined => {
    switch (strategyName) {
        case 'UserPreferences':
            return 'preferences';
        case 'SemanticContext':
            return 'semantic';
        case 'ConversationSummary':
            return 'summary';
        default:
            return undefined;
    }
};

// Helper function to store strategy IDs in SSM
const storeStrategyIds = async (memory: Memory, projNameKebabCase: string, stage: string): Promise<void> => {
    if (!memory.strategies || memory.strategies.length === 0) {
        console.log('No strategies found in memory object');
        return;
    }

    console.log('Storing strategy IDs in SSM parameters...');

    for (const strategy of memory.strategies) {
        if (!strategy.strategyId || !strategy.name) {
            console.warn('Strategy missing ID or name, skipping:', strategy);
            continue;
        }

        const strategyKey = mapStrategyNameToKey(strategy.name);
        if (!strategyKey) {
            console.warn(`Unknown strategy name '${strategy.name}', skipping`);
            continue;
        }

        const strategyIdSsmPath = `/stack/${projNameKebabCase}/${stage}/memory/strategy/${strategyKey}`;

        try {
            await ssmClient.send(
                new PutParameterCommand({
                    Name: strategyIdSsmPath,
                    Value: strategy.strategyId,
                    Description: `Strategy ID for ${strategyKey} strategy in ${projNameKebabCase} ${stage} memory`,
                    Type: 'String',
                    Overwrite: true
                })
            );
            console.log(`Successfully stored strategy ID in SSM: ${strategyIdSsmPath} = ${strategy.strategyId}`);
        } catch (ssmError) {
            console.error(`Failed to store strategy ID in SSM parameter ${strategyIdSsmPath}:`, ssmError);
            // Don't fail the entire operation, just log the error
        }
    }
};

// Helper function to check and retrieve strategy IDs from SSM
const ensureStrategyIdsInSsm = async (memory: Memory, strategies: string[], projNameKebabCase: string, stage: string): Promise<void> => {
    console.log('Checking for strategy IDs in SSM parameters...');

    const missingStrategies: string[] = [];

    // Check which strategy IDs are missing from SSM
    for (const strategyName of strategies) {
        const strategyIdSsmPath = `/stack/${projNameKebabCase}/${stage}/memory/strategy/${strategyName}`;

        try {
            await ssmClient.send(
                new GetParameterCommand({
                    Name: strategyIdSsmPath
                })
            );
            console.log(`Strategy ID already exists in SSM: ${strategyIdSsmPath}`);
        } catch (error) {
            console.log(`Strategy ID not found in SSM: ${strategyIdSsmPath}, will retrieve from memory`);
            missingStrategies.push(strategyName);
        }
    }

    // If any strategy IDs are missing, store them
    if (missingStrategies.length > 0) {
        console.log(`Found ${missingStrategies.length} missing strategy IDs, storing them now`);
        await storeStrategyIds(memory, projNameKebabCase, stage);
    } else {
        console.log('All strategy IDs already present in SSM parameters');
    }
};

// Helper function to extract strategy IDs for CloudFormation response
const getStrategyIdsForResponse = (memory: Memory): Record<string, string> => {
    const strategyIds: Record<string, string> = {};

    if (!memory.strategies || memory.strategies.length === 0) {
        console.log('No strategies found in memory object for response');
        return strategyIds;
    }

    for (const strategy of memory.strategies) {
        if (!strategy.strategyId || !strategy.name) {
            console.warn('Strategy missing ID or name, skipping for response:', strategy);
            continue;
        }

        const strategyKey = mapStrategyNameToKey(strategy.name);
        if (!strategyKey) {
            console.warn(`Unknown strategy name '${strategy.name}' for response, skipping`);
            continue;
        }

        // Use original strategy name for attribute
        const attributeName = `StrategyId${strategyKey}`;
        strategyIds[attributeName] = strategy.strategyId;
        console.log(`Adding strategy ID to response: ${attributeName} = ${strategy.strategyId}`);
    }

    return strategyIds;
};

export const handler = async (event: CloudFormationCustomResourceEvent): Promise<void> => {
    console.log('Memory Custom Resource Event:', JSON.stringify(event, null, 2));

    const { RequestType, ResourceProperties, StackId, RequestId, LogicalResourceId } = event;

    let response: CloudFormationCustomResourceResponse;
    let memoryId: string | undefined;

    try {
        const region = process.env.AWS_REGION;
        if (!region) {
            throw new Error('AWS_REGION environment variable not found');
        }
        console.log('AWS_REGION:', region);

        const stageFromEnv = process.env.STAGE;
        if (!stageFromEnv) {
            throw new Error('STAGE environment variable not found');
        }
        console.log('STAGE from environment:', stageFromEnv);

        const { MemoryName, Stage, ProjNameKebabCase, EventExpiryDuration, Strategies } = parseMemoryCustomResourceProperties(ResourceProperties);

        // Validate memory name meets AWS Bedrock requirements
        if (!/^[a-zA-Z][a-zA-Z0-9_]{0,47}$/.test(MemoryName)) {
            throw new Error(`Invalid memory name '${MemoryName}'. Must start with a letter, contain only letters/numbers/underscores, and be 1-48 characters long.`);
        }

        // Validate required event properties
        const stage = event.ResourceProperties.Stage ?? stageFromEnv;
        if (!stage) {
            throw new Error('Stage is required in ResourceProperties');
        }
        console.log('Stage from ResourceProperties:', stage);

        if (stage !== stageFromEnv) {
            throw new Error('Stage from ResourceProperties does not match STAGE environment variable');
        }

        // SSM parameter path for storing memory ID
        const memoryIdSsmPath = `/stack/${ProjNameKebabCase}/${Stage}/memory/memory_id`;

        if (RequestType === 'Create' || RequestType === 'Update') {
            // Check if we already have a memory management state in SSM
            let existingMemoryId: string | undefined;
            let ssmParameterExists = false;

            try {
                const ssmResponse = await ssmClient.send(
                    new GetParameterCommand({
                        Name: memoryIdSsmPath
                    })
                );
                existingMemoryId = ssmResponse.Parameter?.Value;
                ssmParameterExists = true;

                console.log('Found SSM parameter with value:', existingMemoryId);

                if (!existingMemoryId || existingMemoryId.trim() === '') {
                    throw new Error(`CRITICAL: SSM parameter '${memoryIdSsmPath}' exists but is empty. This indicates a corrupted state that requires manual cleanup.`);
                }
            } catch (error) {
                if (ssmParameterExists) {
                    // Re-throw validation errors
                    throw error;
                }
                console.log('No existing SSM parameter found, will create new memory. Error:', error instanceof Error ? error.message : error);
            }

            let memory: Memory | undefined;

            // If we have an existing memory ID, validate it exists in Bedrock
            if (existingMemoryId) {
                try {
                    const getResponse = await bedrockClient.send(
                        new GetMemoryCommand({
                            memoryId: existingMemoryId
                        })
                    );
                    memory = getResponse.memory;

                    if (memory?.id) {
                        console.log('Successfully validated existing memory:', memory.id);
                    } else {
                        console.warn(`SSM parameter indicates memory should exist (${existingMemoryId}) but Bedrock returned no memory data. Will create new memory.`);
                        existingMemoryId = undefined;
                    }
                } catch (error) {
                    console.log(
                        `SSM parameter indicates memory should exist (${existingMemoryId}) but Bedrock cannot find it. Will create new memory. Error: ${error instanceof Error ? error.message : error}`
                    );
                    existingMemoryId = undefined;
                }

                if (memory && existingMemoryId) {
                    // Ensure strategy IDs are stored in SSM parameters
                    await ensureStrategyIdsInSsm(memory, Strategies, ProjNameKebabCase, Stage);
                }
            }

            // If no existing memory found, create a new one
            if (!memory) {
                console.log('Creating new memory with name:', MemoryName);

                // Build memory strategies based on the provided strategy names
                const memoryStrategies = Strategies.map((strategyName) => {
                    switch (strategyName) {
                        case 'preferences':
                            return {
                                userPreferenceMemoryStrategy: {
                                    name: 'UserPreferences',
                                    description: 'Captures user preferences, communication styles, and stated preferences',
                                    namespaces: [`${getMemoryNamespaceForStrategy('preferences')}`]
                                }
                            };
                        case 'semantic':
                            return {
                                semanticMemoryStrategy: {
                                    name: 'SemanticContext',
                                    description: 'Understands contextual and domain-specific information about users',
                                    namespaces: [`${getMemoryNamespaceForStrategy('semantic')}`]
                                }
                            };
                        case 'summary':
                            return {
                                summaryMemoryStrategy: {
                                    name: 'ConversationSummary',
                                    description: 'Maintains high-level insights from past conversations',
                                    namespaces: [`${getMemoryNamespaceForStrategy('summary')}`]
                                }
                            };
                        default:
                            throw new Error(`Unsupported memory strategy: ${strategyName}`);
                    }
                });

                try {
                    console.log('Creating memory with parameters:', {
                        name: MemoryName,
                        description: `User memory for ${ProjNameKebabCase} ${Stage} environment`,
                        eventExpiryDuration: EventExpiryDuration,
                        strategiesCount: memoryStrategies.length
                    });

                    const createResponse = await bedrockClient.send(
                        new CreateMemoryCommand({
                            name: MemoryName,
                            description: `User memory for ${ProjNameKebabCase} ${Stage} environment`,
                            eventExpiryDuration: EventExpiryDuration,
                            memoryStrategies: memoryStrategies
                        })
                    );

                    memory = createResponse.memory;
                    console.log('Successfully created memory:', memory?.id);
                } catch (createError) {
                    console.error('Failed to create memory:', createError);
                    throw new Error(`Failed to create Bedrock memory: ${createError instanceof Error ? createError.message : String(createError)}`);
                }

                // Store the memory ID in SSM for future reference
                if (memory?.id) {
                    console.log('Memory ID from Bedrock API:', memory.id);

                    console.log('Storing memory ID in SSM:', {
                        parameter: memoryIdSsmPath,
                        memoryId: memory.id,
                        memoryName: memory.name,
                        memoryArn: memory.arn
                    });

                    try {
                        await ssmClient.send(
                            new PutParameterCommand({
                                Name: memoryIdSsmPath,
                                Value: memory.id,
                                Description: `Memory ID for ${ProjNameKebabCase} ${Stage} user memory (Name: ${memory.name})`,
                                Type: 'String',
                                Overwrite: true
                            })
                        );
                        console.log('Successfully stored memory ID in SSM parameter:', {
                            parameter: memoryIdSsmPath,
                            value: memory.id
                        });

                        // Store strategy IDs in SSM parameters
                        await storeStrategyIds(memory, ProjNameKebabCase, Stage);
                    } catch (ssmError) {
                        console.error('Failed to store memory ID in SSM parameter:', ssmError);
                        // Don't fail the entire operation - the memory was created successfully
                        // Log the issue but continue, as the memory ID will be in the CloudFormation response
                        console.error(
                            `WARNING: Memory was created successfully (${memory.id}) but failed to store in SSM for future reference. Error: ${ssmError instanceof Error ? ssmError.message : ssmError}`
                        );
                    }
                } else {
                    throw new Error('CRITICAL: Memory was created but no memory ID was returned by Bedrock API');
                }
            }

            if (!memory?.id) {
                throw new Error('Failed to create or retrieve memory');
            }

            memoryId = memory.id;

            // Extract strategy IDs for CloudFormation response
            const strategyIds = getStrategyIdsForResponse(memory);

            response = {
                Status: 'SUCCESS',
                PhysicalResourceId: memory.id, // Keep this unchanged - critical for CDK
                StackId,
                RequestId,
                LogicalResourceId,
                Data: {
                    MemoryId: memory.id,
                    MemoryArn: memory.arn,
                    MemoryName: memory.name,
                    ...strategyIds // Add strategy IDs as additional attributes
                }
            };
        } else if (RequestType === 'Delete') {
            // On delete, we intentionally do NOT delete the memory as requested
            // Just return success with the existing physical resource ID
            console.log('Delete requested - intentionally not deleting memory to preserve user data');

            response = {
                Status: 'SUCCESS',
                PhysicalResourceId: event.PhysicalResourceId || 'memory-not-deleted',
                StackId,
                RequestId,
                LogicalResourceId
            };
        } else {
            throw new Error(`Unsupported request type: ${RequestType}`);
        }
    } catch (error) {
        console.error('Error processing memory custom resource:', error);

        response = {
            Status: 'FAILED',
            Reason: error instanceof Error ? error.message : 'Unknown error occurred',
            PhysicalResourceId: memoryId || 'failed-resource',
            StackId,
            RequestId,
            LogicalResourceId
        };
    }

    try {
        console.log('Sending response to CloudFormation...');
        await sendCustomResourceResponse(event, response);
        console.log('CloudFormation response sent successfully');
    } catch (e) {
        // This is a critical failure - CloudFormation will hang without a response
        console.error('CRITICAL: Failed to send response to CloudFormation:', e);

        // Log everything we can for debugging
        console.error('Event that failed:', JSON.stringify(event, null, 2));
        console.error('Response that failed:', JSON.stringify(response, null, 2));

        // Re-throw to ensure Lambda fails and gets retried/alerted
        throw new Error(`Critical failure: CloudFormation response not sent. Stack will hang. Error: ${e instanceof Error ? e.message : String(e)}`);
    }
};
