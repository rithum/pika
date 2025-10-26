---
title: Inline Tools Development
description: Complete guide to creating and deploying inline tools in Pika
outline: [2, 3]
---

# Inline Tools Development

Inline tools provide a lightweight way to add simple functionality to your Pika agents without the overhead of deploying separate Lambda functions. This guide walks through creating, configuring, and deploying inline tools.

## Overview

Inline tools are TypeScript functions that get transpiled to JavaScript and embedded directly into your agent's tool configuration. They execute within the agent runtime, making them perfect for:

- **Rapid prototyping** of tool concepts
- **Simple utility functions** that don't require external dependencies
- **Testing and learning** how tools work with agents
- **Quick calculations** and data transformations

:::warning[Production Considerations]
Inline tools are primarily intended for development, prototyping, and testing. For production applications, consider using Lambda-based tools for better scalability, monitoring, and maintenance capabilities.
:::

## Creating an Inline Tool

### 1. Define Your Tool Function

Create a TypeScript file with a single function. The function must follow this exact signature:

```js
function yourFunctionName(event: ActionGroupInvocationInput, params: Record<string, any>) {
    // Your logic here
    return result;
}
```

**Critical Requirements:**

- **Must be a standalone function** - No imports, exports, or other code
- **No external dependencies** - Cannot use npm packages or AWS SDK
- **Simple return values** - Return JSON-serializable data
- **Quick execution** - Should complete within seconds

### 2. Example Implementation

Here's a complete example from the random number generator sample:

```js
import { ActionGroupInvocationInput } from '@aws-sdk/client-bedrock-agent-runtime';

function random(event: ActionGroupInvocationInput, params: Record<string, any>) {
    console.log('Random number generator tool called with params:', params);

    let min = params.min;
    let max = params.max;
    let range = max - min;
    let val = Math.random() * range + min;
    let factor = Math.pow(10, params.precision ?? 0);
    return Math.round(val * factor) / factor;
}
```

### 3. Define Function Schema

Create the function schema that describes your tool's parameters:

```js
import { FunctionDefinition } from '@aws-sdk/client-bedrock-agent-runtime';

export const randomNumFunctions: FunctionDefinition[] = [
    {
        name: 'random-number',
        description: 'Creates a random number between min and max.',
        parameters: {
            max: {
                description: 'max value (exclusive)',
                required: true,
                type: 'number'
            },
            min: {
                description: 'min value (inclusive)',
                required: true,
                type: 'number'
            },
            precision: {
                description: 'number of decimal places to include (default 0)',
                required: false,
                type: 'number'
            }
        },
        requireConfirmation: 'DISABLED'
    }
];
```

## CDK Stack Integration

### 1. Transpilation Helper

Add a method to your CDK stack to transpile TypeScript to JavaScript:

```js
private transpileInlineCodeToJavascript(filePath: string): string {
    // Resolve the file path relative to this stack file
    const absolutePath = path.resolve(__dirname, filePath);

    // Read the TypeScript file
    const tsCode = fs.readFileSync(absolutePath, 'utf8');

    // Use esbuild to transpile TypeScript to JavaScript synchronously
    const result = esbuild.transformSync(tsCode, {
        loader: 'ts',
        target: 'es2022',
        format: 'esm'
    });

    const jsCode = result.code;

    if (!jsCode.trim()) {
        throw new Error(`No function found in ${filePath}`);
    }

    // Validate that the code starts with a function declaration
    if (!jsCode.trim().startsWith('function ')) {
        throw new Error(`Code does not start with a function declaration in ${filePath}`);
    }

    return jsCode;
}
```

### 2. Required Dependencies

Add these dependencies to your CDK stack's `package.json`:

```json
{
    "dependencies": {
        "esbuild": "^0.19.0"
    },
    "devDependencies": {
        "@types/node": "^18.0.0"
    }
}
```

### 3. Tool Configuration

Configure your inline tool in the agent definition:

```js
const randomNumInlineCode = this.transpileInlineCodeToJavascript('../../src/random-num-inline/inline-code.ts');

const agentData: AgentDataRequest = {
    userId: `cloudformation/${this.stackName}`,
    agent: {
        agentId: `${props.projNameKebabCase}-agent-${this.stage}`,
        basePrompt: randomNumInlineAgentInstruction
    },
    tools: [
        {
            toolId: `${props.projNameKebabCase}-tool-${this.stage}`,
            executionType: 'inline',  // This marks it as an inline tool
            name: `${props.projNameKebabCase}-tool`,
            displayName: `${props.projNameTitleCase} Tool`,
            code: randomNumInlineCode,  // The transpiled JavaScript code
            description: `A tool that can be used to generate random numbers`,
            functionSchema: randomNumFunctions,
            supportedAgentFrameworks: ['bedrock']
        }
    ]
};
```

## File Structure

Organize your inline tool project with this structure:

```
your-inline-tool/
├── src/
│   └── your-tool/
│       ├── inline-code.ts          # Your tool function
│       ├── tool-functions.ts       # Function schema definition
│       ├── tool-instructions.ts    # Agent instructions
│       └── tool-suggestions.ts     # Optional chat suggestions
├── lib/
│   └── stacks/
│       └── your-tool-stack.ts      # CDK stack with transpilation
├── bin/
│   └── your-tool.ts                # CDK app entry point
├── package.json
├── tsconfig.json
└── cdk.json
```

## Testing Your Inline Tool

### 1. Deploy and Test

Deploy your stack and test through the chat interface:

```bash
npm run deploy
```

### 2. Monitor Logs

Check CloudWatch logs for your agent to see tool execution logs:

- Agent logs show when tools are called
- Your `console.log()` statements appear in the logs
- Error messages and stack traces help with debugging

### 3. Iterate Quickly

Since inline tools are embedded in the configuration:

1. Update your TypeScript function
2. Redeploy the stack
3. Test immediately - no separate Lambda deployment needed

## Sample Project Walkthrough

The [random-num-inline sample](https://github.com/rithum/pika/tree/main/services/samples/random-num-inline) demonstrates:

### Tool Function

```js
function random(event: ActionGroupInvocationInput, params: Record<string, any>) {
    console.log('Random number generator tool called with params:', params);

    let min = params.min;
    let max = params.max;
    let range = max - min;
    let val = Math.random() * range + min;
    let factor = Math.pow(10, params.precision ?? 0);
    return Math.round(val * factor) / factor;
}
```

### Agent Instructions

```js
export const randomNumInlineAgentInstruction = `You are a random number generator. You will use the tool provided to generate a random number.

If the user doesn't provide a min or max value, then you should use a default of 1 and 100 respectively by default and let them know that you are using defaults and that they can provide a min and max value if they want to.

{{prompt-assistance}}
`;
```

### Complete Integration

The sample shows how all pieces fit together:

- TypeScript tool function
- Function schema definition
- CDK stack configuration
- Agent and chat app setup

## Troubleshooting

### Common Issues

**"Code does not start with a function declaration"**

- Ensure your TypeScript transpiles to only only a single function

**"Function not found"**

- Check that your file path in `transpileInlineCodeToJavascript()` is correct
- Verify the function exists and has the correct signature

**Tool not executing**

- Verify the `executionType` is set to `'inline'`
- Check that the function schema matches your function's expected parameters
- Review CloudWatch logs for error messages

### Debugging Tips

1. **Add logging** - Use `console.log()` liberally to understand execution flow
2. **Check parameters** - Log the `params` object to see what the agent is passing
3. **Test incrementally** - Start with simple return values before adding complex logic
4. **Validate transpilation** - Check that the generated JavaScript looks correct

## Migration Path

When your inline tool grows complex or needs production features:

1. **Extract to Lambda** - Move the function to a separate Lambda-based tool
2. **Add dependencies** - Use external libraries and AWS SDK as needed
3. **Implement error handling** - Add proper error handling and monitoring
4. **Scale as needed** - Configure concurrency, memory, and timeout settings

:::tip[Next Steps]

- Explore the [random-num-inline sample project](https://github.com/rithum/pika/tree/main/services/samples/random-num-inline)
- Learn about [Lambda-based tools](/docs/developer/customization/) for production use
- Check out [Multi Agent Collaboration](/docs/developer/multi-agent-collaboration/) for advanced workflows
  :::
