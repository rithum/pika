# Pika Serverless Plugin

A comprehensive Serverless Framework v3 plugin that enables seamless integration of Pika ChatApp, ChatAgent, and Tool functionality with AWS Lambda functions. This plugin provides a complete bridge between your Serverless Framework functions and the Pika AI chat platform, matching the functionality available in the CDK implementation.

## Features

- **Agent Integration**: Define AI agents with custom prompts and tools
- **Chat App Creation**: Create chat applications with rich feature sets
- **Tool Definition**: Define Lambda-backed tools for AI agents
- **Semantic Directive Definition**: Define instruction augmentation directives for dynamic context injection
- **Auto-tagging**: Automatically tags Lambda functions as `agent-tool: true` (matching CDK behavior)
- **Permission Management**: Automatically adds Bedrock invoke permissions
- **Data Compression**: Handles gzip compression and base64 encoding of configuration data
- **CloudFormation Integration**: Uses custom resources for deployment-time resolution
- **Schema Validation**: Built-in validation for all configuration options
- **CDK Compatibility**: Matches the exact behavior of the existing CDK implementation

## Installation

```bash
npm install --save-dev @pika/pika-serverless
```

## Quick Start

### 1. Add Plugin to serverless.yml

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
        # Custom resource ARNs (resolved at deploy time using CloudFormation)
        agentCustomResourceArn: '{"Fn::Sub": "{{resolve:ssm:/stack/pika/${self:provider.stage}/lambda/agent_custom_resource_arn}}"}}'
        chatAppCustomResourceArn: '{"Fn::Sub": "{{resolve:ssm:/stack/pika/${self:provider.stage}/lambda/chat_app_custom_resource_arn}}"}}'
        semanticDirectiveCustomResourceArn: '{"Fn::Sub": "{{resolve:ssm:/stack/pika/${self:provider.stage}/lambda/semantic_directive_custom_resource_arn}}"}}'

        # Agent definitions
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
                    lambdaFunctionLogicalId: 'weatherFunction' # References function defined below
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

        # Chat app definitions
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

        # Semantic directive definitions
        semanticDirectives:
            - userId: 'cloudformation/${self:service}'
              semanticDirectives:
                  - scope: 'chatapp#weather-chat'
                    id: 'temperature-format'
                    description: 'Instructions for temperature display preferences'
                    instructions: 'Always provide temperatures in both Celsius and Fahrenheit (e.g., "22°C (72°F)") unless the user specifically requests one format.'
                    createdBy: 'cloudformation/${self:service}'
                    lastUpdatedBy: 'cloudformation/${self:service}'
                  - scope: 'agent#${self:service}-agent'
                    id: 'safety-reminders'
                    description: 'Safety instructions for severe weather conditions'
                    instructions: 'When reporting severe weather conditions (storms, extreme temperatures, etc.), always emphasize safety precautions and recommend checking local authorities for emergency guidance.'
                    createdBy: 'cloudformation/${self:service}'
                    lastUpdatedBy: 'cloudformation/${self:service}'

functions:
    weatherFunction:
        handler: 'src/lambda/weather/index.handler'
        timeout: 30

    calculatorFunction:
        handler: 'src/lambda/calculator/index.handler'
        timeout: 15
```

### 2. Deploy

```bash
serverless deploy --stage dev
```

## What the Plugin Does

The plugin automatically handles all the integration work that matches your CDK implementation:

1. **Tags Lambda Functions**: Adds `agent-tool: true` tags (matching `cdk.Tags.of(weatherLambda).add('agent-tool', 'true')`)

2. **Adds Bedrock Permissions**: Automatically adds IAM permissions for Bedrock to invoke your Lambda functions (matching `weatherLambda.addPermission('allowAgentInvokeFn', {...})`)

3. **Creates Custom Resources**: Generates CloudFormation custom resources with compressed data for agents, chat apps, and semantic directives

4. **Handles ARN Resolution**: Supports CloudFormation intrinsic functions for dynamic resource ARN resolution at deploy time

5. **Compresses Data**: Uses gzip compression and base64 encoding for configuration data sent to custom resources

6. **Semantic Directive Processing**: Automatically deploys instruction augmentation directives for dynamic context injection

## Configuration Formats

### Config

```yaml
# serverless.yml
custom:
    pika:
        agentCustomResourceArn: '{"Fn::Sub": "{{resolve:ssm:/stack/pika/${stage}/lambda/agent_custom_resource_arn}}"}}'
        chatAppCustomResourceArn: '{"Fn::Sub": "{{resolve:ssm:/stack/pika/${stage}/lambda/chat_app_custom_resource_arn}}"}}'
        semanticDirectiveCustomResourceArn: '{"Fn::Sub": "{{resolve:ssm:/stack/pika/${stage}/lambda/semantic_directive_custom_resource_arn}}"}}'

        # Multiple agents can reference different combinations of tools
        agents:
            - userId: 'cloudformation/${self:service}'
              agent:
                  agentId: 'weather-agent-${self:provider.stage}'
                  basePrompt: 'You are a weather assistant.'
              tools:
                  - toolId: 'weather-tool-${self:provider.stage}'
                    name: 'weather-tool'
                    displayName: 'Weather Tool'
                    lambdaFunctionLogicalId: 'weatherFunction' # References any function
                    # ... other tool properties

            - userId: 'cloudformation/${self:service}'
              agent:
                  agentId: 'multi-tool-agent-${self:provider.stage}'
                  basePrompt: 'I can help with weather and calculations.'
              tools:
                  - toolId: 'weather-tool-${self:provider.stage}'
                    lambdaFunctionLogicalId: 'weatherFunction'
                    # ... tool definition
                  - toolId: 'calc-tool-${self:provider.stage}'
                    lambdaFunctionLogicalId: 'calculatorFunction'
                    # ... tool definition

        # Chat apps reference agents
        chatApps:
            - userId: 'cloudformation/${self:service}'
              chatApp:
                  chatAppId: 'weather-chat'
                  title: 'Weather Assistant'
                  agentId: 'weather-agent-${self:provider.stage}'
                  enabled: true

        # Semantic directives for instruction augmentation
        semanticDirectives:
            - userId: 'cloudformation/${self:service}'
              semanticDirectives:
                  - scope: 'chatapp#weather-chat'
                    id: 'professional-tone'
                    description: 'Instructions for maintaining professional communication'
                    instructions: 'Maintain a professional yet friendly tone in all interactions. Use clear, concise language and avoid overly technical jargon.'
                    createdBy: 'cloudformation/${self:service}'
                    lastUpdatedBy: 'cloudformation/${self:service}'
                  - scope: 'agent#weather-agent-${self:provider.stage}'
                    id: 'data-accuracy'
                    description: 'Guidelines for weather data accuracy and sources'
                    instructions: 'Always specify the source and time of weather data. If data is older than 3 hours, mention this to users and suggest checking for more recent updates.'
                    createdBy: 'cloudformation/${self:service}'
                    lastUpdatedBy: 'cloudformation/${self:service}'

functions:
    weatherFunction:
        handler: 'src/lambda/weather/index.handler'

    calculatorFunction:
        handler: 'src/lambda/calculator/index.handler'
```

### Custom Resource ARN Formats

The plugin supports various ways to specify custom resource ARNs:

```typescript
// Static ARN
agentCustomResourceArn: 'arn:aws:lambda:us-east-1:123456789:function:my-custom-resource';
semanticDirectiveCustomResourceArn: 'arn:aws:lambda:us-east-1:123456789:function:my-semantic-directive-resource';

// CloudFormation SSM parameter resolution (recommended)
agentCustomResourceArn: '{"Fn::Sub": "{{resolve:ssm:/stack/pika/${stage}/lambda/agent_custom_resource_arn}}"}';
semanticDirectiveCustomResourceArn: '{"Fn::Sub": "{{resolve:ssm:/stack/pika/${stage}/lambda/semantic_directive_custom_resource_arn}}"}';

// CloudFormation reference
agentCustomResourceArn: '{"Ref": "MyCustomResourceFunction"}';
semanticDirectiveCustomResourceArn: '{"Ref": "MySemanticDirectiveResourceFunction"}';

// CloudFormation GetAtt
agentCustomResourceArn: '{"Fn::GetAtt": ["MyCustomResourceFunction", "Arn"]}';
semanticDirectiveCustomResourceArn: '{"Fn::GetAtt": ["MySemanticDirectiveResourceFunction", "Arn"]}';
```

## Tool Configuration

Tools are the Lambda functions that agents can call to perform actions:

```typescript
tools: [
    {
        toolId: '${self:service}-weather-tool-${self:provider.stage}',
        name: 'weather-tool', // Must match function naming conventions
        displayName: 'Weather Information Tool',
        description: 'Retrieves current weather and forecast data',
        executionType: 'lambda',
        lambdaArn: 'WILL_BE_REPLACED_BY_CUSTOM_RESOURCE_LAMBDA_WHEN_DEPLOYED',
        functionSchema: [
            {
                name: 'getCurrentWeather',
                description: 'Get current weather conditions',
                parameters: {
                    type: 'object',
                    properties: {
                        location: { type: 'string', description: 'Location to get weather for' }
                    },
                    required: ['location']
                }
            }
        ],
        supportedAgentFrameworks: ['bedrock']
    }
];
```

## Chat App Features

Configure rich chat app features:

```typescript
features: {
  suggestions: {
    featureId: 'suggestions',
    enabled: true,
    suggestions: ['Example suggestion 1', 'Example suggestion 2'],
    randomize: true,
    maxToShow: 3
  },
  fileUpload: {
    featureId: 'fileUpload',
    enabled: true,
    mimeTypesAllowed: ['text/csv', 'application/json']
  },
  promptInputFieldLabel: {
    featureId: 'promptInputFieldLabel',
    enabled: true,
    promptInputFieldLabel: 'Ask me anything...'
  },
  agentInstructionAssistance: {
    featureId: 'agentInstructionAssistance',
    enabled: true
  }
}
```

## Semantic Directive Configuration

Define instruction augmentation directives that dynamically enhance agent responses based on context:

```typescript
semanticDirectives: [
    {
        userId: 'cloudformation/${self:service}',
        semanticDirectives: [
            {
                scope: 'chatapp#my-weather-app',
                id: 'temperature-units',
                description: 'Instructions for temperature unit preferences',
                instructions: 'Always provide temperatures in both Celsius and Fahrenheit unless specifically requested otherwise.',
                createdBy: 'cloudformation/${self:service}',
                lastUpdatedBy: 'cloudformation/${self:service}'
            },
            {
                scope: 'agent#weather-agent',
                id: 'severe-weather-safety',
                description: 'Safety guidelines for severe weather reporting',
                instructions: 'When reporting severe weather conditions, always emphasize safety precautions and recommend checking local emergency services.',
                createdBy: 'cloudformation/${self:service}',
                lastUpdatedBy: 'cloudformation/${self:service}'
            },
            {
                scope: 'tool#weather-forecast-api',
                id: 'data-freshness',
                description: 'Guidelines for weather data recency',
                instructions: 'Always mention the timestamp of weather data. If data is older than 2 hours, recommend users check for more recent updates.',
                createdBy: 'cloudformation/${self:service}',
                lastUpdatedBy: 'cloudformation/${self:service}'
            }
        ]
    }
];
```

### Scope Patterns

Semantic directives support various scope patterns for targeting:

- **`chatapp#my-app`** - Applies to all interactions within the chat app
- **`agent#my-agent`** - Applies to all interactions with the specific agent
- **`tool#my-tool`** - Applies when the specific tool is used
- **Entity-based** (requires Entity Feature): `entity#{entityValue}` - Applies based on user's organizational context (e.g., `entity#account-123`)
- **Compound scopes**: `agent#my-agent#entity#{entityValue}` - Combines multiple targeting criteria, only agent + entity supported today

### Best Practices

- **Descriptive IDs**: Use clear, descriptive IDs like `temperature-format` or `safety-reminders`
- **Focused Instructions**: Keep instructions specific and actionable
- **Clear Descriptions**: Help the LLM understand when to apply each directive
- **Scope Targeting**: Use appropriate scopes to minimize irrelevant directive retrieval
- **User Attribution**: Use consistent `createdBy` and `lastUpdatedBy` values for tracking

## Plugin Lifecycle

The plugin hooks into these Serverless Framework lifecycle events:

1. **`before:aws:package:finalize`**: Process legacy service-level configurations (TODO: remove if not needed)
2. **`before:package:finalize`**: Process function-level configurations, add tags and permissions
3. **`after:aws:package:finalize:mergeCustomProviderResources`**: Add custom CloudFormation resources

## Debugging

Enable debug logging to see detailed plugin operation:

```bash
SLS_DEBUG=* serverless deploy
```

The plugin will log:

- Number of functions being processed
- Validation results
- CloudFormation resource creation
- Tag and permission additions

## Migration from CDK

This plugin is designed to provide the exact same functionality as the CDK implementation. The main differences when migrating:

1. **Configuration Location**: Move from CDK construct properties to function-level `pika` configuration
2. **Resource ARNs**: Use CloudFormation intrinsic functions for dynamic resolution
3. **Deployment**: Use `serverless deploy` instead of CDK deploy commands
4. **Function Schema**: Define Bedrock function schemas in the tool configuration

## Requirements

- **Serverless Framework**: v3.x
- **Node.js**: 22.x or higher
- **AWS Provider**: Required
- **Pika Infrastructure**: Must have deployed Pika custom resources (agent, chat app, and semantic directive custom resource functions)
- **SSM Parameters**: Custom resource ARNs must be stored in AWS Systems Manager Parameter Store

## Compatibility

- **Pika Shared Types**: Uses the same types as your CDK implementation
- **CloudFormation**: Full support for intrinsic functions and references
- **AWS Bedrock**: Compatible with AWS Bedrock agents
- **TypeScript**: Full type safety and IntelliSense support

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests: `npm test`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Submit a pull request

## License

MIT License - see LICENSE file for details.
