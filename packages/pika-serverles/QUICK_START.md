# Quick Start Guide

Get the Pika Serverless plugin up and running quickly with your existing Serverless Framework functions.

## Prerequisites

- Serverless Framework v3.x
- Node.js 22.x or higher
- AWS account with appropriate permissions
- Deployed Pika infrastructure (agent and chat app custom resources)
- SSM parameters containing your custom resource ARNs

## Step 1: Install the Plugin

```bash
npm install --save-dev @pika/pika-serverless
```

## Step 2: Add Plugin and Pika Configuration

```yaml
# serverless.yml
service: weather-service

plugins:
    - '@pika/pika-serverless'

provider:
    name: aws
    runtime: nodejs22.x
    region: us-east-1
    stage: ${opt:stage, 'dev'}

custom:
    pika:
        # Custom resource ARNs (resolved at deploy time)
        agentCustomResourceArn: '{{resolve:ssm:/stack/pika/${self:provider.stage}/lambda/agent_custom_resource_arn}}'
        chatAppCustomResourceArn: '{{resolve:ssm:/stack/pika/${self:provider.stage}/lambda/chat_app_custom_resource_arn}}'

        # Define your AI agents
        agents:
            - userId: 'cloudformation/${self:service}'
              agent:
                  agentId: '${self:service}-agent'
                  basePrompt: 'You are WeatherInsightAgent, a helpful weather assistant that provides accurate weather information with a professional and friendly tone.'
              tools:
                  - toolId: '${self:service}-tool'
                    name: 'weather-tool'
                    displayName: 'Weather Information Tool'
                    description: 'A tool that provides current weather conditions and forecasts'
                    executionType: 'lambda'
                    lambdaFunctionLogicalId: 'weatherFunction' # References function below
                    functionSchema:
                        - name: 'getCurrentWeather'
                          description: 'Get current weather for a location'
                          parameters:
                              type: 'object'
                              properties:
                                  latitude:
                                      type: 'number'
                                      description: 'Latitude in decimal degrees (e.g., 37.7749)'
                                  longitude:
                                      type: 'number'
                                      description: 'Longitude in decimal degrees (e.g., -122.4194)'
                              required: ['latitude', 'longitude']
                        - name: 'getGeocoding'
                          description: 'Convert location names to coordinates'
                          parameters:
                              type: 'object'
                              properties:
                                  name:
                                      type: 'string'
                                      description: 'Location name (e.g., San Francisco)'
                              required: ['name']
                    supportedAgentFrameworks: ['bedrock']

        # Define your chat app UI
        chatApps:
            - userId: 'cloudformation/${self:service}'
              chatApp:
                  chatAppId: 'weather-chat'
                  modesSupported: ['standalone', 'embedded']
                  dontCacheThis: true # For development
                  title: 'Weather Assistant'
                  description: 'Get weather information through natural conversation'
                  userTypes: ['internal-user']
                  agentId: '${self:service}-agent-${self:provider.stage}'
                  features:
                      suggestions:
                          featureId: 'suggestions'
                          enabled: true
                          suggestions: ["What's the weather in Tokyo?", 'Will it rain in London this weekend?', "What's the current weather in New York City?"]
                          randomize: true
                          maxToShow: 3
                  enabled: true

functions:
    weatherFunction:
        handler: 'src/lambda/weather/index.handler'
        timeout: 30
```

## Step 3: Clean Function Definitions

Your function definitions are now clean and focused on Lambda configuration:

```typescript
// functions.ts (optional - if you prefer TypeScript configuration)
import { AwsFunction } from '@serverless/typescript';

const weatherFunction: AwsFunction = {
    handler: 'src/lambda/weather/index.handler',
    role: 'ApiRole',
    timeout: 30
    // No more Pika configuration here - it's all in serverless.yml custom.pika!
};

export { weatherFunction };
```

## Step 4: Implement Your Lambda Handler

Create your Lambda function to handle Bedrock agent calls:

```typescript
// src/lambda/weather/index.ts
import { Handler } from 'aws-lambda';

interface WeatherEvent {
    sessionId: string;
    inputText: string;
    actionGroup: string;
    function: string;
    parameters: {
        location?: string;
        unit?: 'celsius' | 'fahrenheit';
    };
}

export const handler: Handler = async (event: WeatherEvent, context) => {
    console.log('Weather handler received:', JSON.stringify(event, null, 2));

    try {
        const { function: functionName, parameters, actionGroup } = event;

        let responseText: string;

        switch (functionName) {
            case 'getCurrentWeather':
                const { location, unit } = parameters;

                if (!location) {
                    responseText = 'Please provide a location to get weather information.';
                } else {
                    // Your weather logic here - call weather API, etc.
                    responseText = `Current weather in ${location}: Sunny, 72°F (22°C)`;
                }
                break;

            default:
                responseText = `Unknown function: ${functionName}`;
        }

        return {
            response: {
                actionGroup,
                function: functionName,
                functionResponse: {
                    responseBody: {
                        TEXT: {
                            body: responseText
                        }
                    }
                }
            }
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            response: {
                actionGroup: event.actionGroup,
                function: event.function,
                functionResponse: {
                    responseBody: {
                        TEXT: {
                            body: `Error: ${error.message}`
                        }
                    }
                }
            }
        };
    }
};
```

## Step 5: Deploy

```bash
serverless deploy --stage dev
```

## What Happens During Deployment

The plugin automatically:

1. **Adds Tags**: Tags your Lambda function with `agent-tool: true` (matches CDK behavior)
2. **Sets Permissions**: Adds IAM permission for `bedrock.amazonaws.com` to invoke your function
3. **Creates Custom Resources**: Generates CloudFormation custom resources for your agent and chat app
4. **Compresses Data**: Compresses your configuration data for the custom resources
5. **Maps Lambda ARNs**: Automatically maps tool IDs to your deployed Lambda function ARNs

## Verification

After deployment, verify everything worked:

### Check Lambda Function

```bash
aws lambda get-function --function-name weather-service-dev-weatherFunction --query 'Tags'
```

Should show: `{"agent-tool": "true"}`

### Check Lambda Permissions

```bash
aws lambda get-policy --function-name weather-service-dev-weatherFunction
```

Should show Bedrock invoke permission.

### Check CloudFormation Stack

```bash
aws cloudformation describe-stacks --stack-name weather-service-dev
```

Should show custom resources for your agent and chat app.

## Configuration Options

### Tool-Only Configuration

If you only need to create a tool (without agent or chat app), you can use a simpler configuration:

```yaml
# In serverless.yml - tool only (no agent or chat app)
custom:
    pika:
        # No custom resource ARNs needed for tool-only configuration
        agents:
            - userId: 'cloudformation/${self:service}'
              agent:
                  agentId: '${self:service}-agent-${self:provider.stage}'
                  basePrompt: 'You are a helpful assistant.'
              tools:
                  - toolId: 'my-tool-${self:provider.stage}'
                    name: 'my-tool'
                    displayName: 'My Tool'
                    description: 'A simple tool'
                    executionType: 'lambda'
                    lambdaFunctionLogicalId: 'myToolFunction'
                    functionSchema: [] # Your function schema here
                    supportedAgentFrameworks: ['bedrock']

functions:
    myToolFunction:
        handler: 'src/lambda/tool/index.handler'
        timeout: 30
```

### Custom Resource ARN Formats

```typescript
// CloudFormation SSM parameter (recommended)
agentCustomResourceArn: '{"Fn::Sub": "{{resolve:ssm:/stack/pika/${stage}/lambda/agent_custom_resource_arn}}"}';

// Static ARN
agentCustomResourceArn: 'arn:aws:lambda:us-east-1:123456789012:function:my-agent-resource';

// CloudFormation reference
agentCustomResourceArn: '{"Ref": "MyAgentCustomResourceFunction"}';
```

## Troubleshooting

### Common Issues

1. **"No pika configuration found"**: Make sure you have `pika: {}` in your function definition

2. **"agentCustomResourceArn is required"**: You must provide custom resource ARNs when using agent or chatApp configurations

3. **SSM parameter not found**: Ensure your Pika infrastructure is deployed and SSM parameters exist

4. **Permission denied**: Verify your deployment role has permissions to create Lambda permissions and custom resources

### Debug Mode

```bash
SLS_DEBUG=* serverless deploy --stage dev
```

Will show detailed plugin operation including:

- Functions being processed
- Configuration validation
- CloudFormation resources being created

### Test Locally

```bash
serverless invoke local --function weatherFunction --data '{
    "function": "getCurrentWeather",
    "parameters": { "latitude": 37.7749, "longitude": -122.4194 },
    "actionGroup": "weather-tools"
}'
```

## Next Steps

1. **Customize Your Agent**: Modify the `basePrompt` for your specific use case
2. **Add More Tools**: Include additional tools in the `tools` array
3. **Configure Features**: Enable file upload, custom styling, or other chat app features
4. **Test Integration**: Use the Pika chat interface to test your deployed agent
5. **Monitor Performance**: Set up CloudWatch logs and metrics

## Getting Help

- Review the [complete examples](./examples/)
- Check the [full documentation](./README.md)
- Enable debug logging: `SLS_DEBUG=* serverless deploy`
- Verify your Pika infrastructure is properly deployed
- Ensure SSM parameters are accessible in your AWS account
