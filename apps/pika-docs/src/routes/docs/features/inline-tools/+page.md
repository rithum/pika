---
title: Inline Tools
description: Simple TypeScript tools that execute directly within agents for rapid prototyping and testing
outline: [2, 3]
---

# Inline Tools

Inline tools are lightweight, simple tools that execute directly within the Pika agent runtime without requiring separate Lambda functions. They're perfect for rapid prototyping, testing tool concepts, and implementing simple utility functions.

## What are Inline Tools?

Unlike traditional Pika tools that deploy as separate AWS Lambda functions, inline tools embed their code directly into the agent's tool definition. When an agent needs to call an inline tool, the code executes immediately within the agent runtime environment.

This makes inline tools:

- **Fast to develop**: No deployment pipeline required
- **Instant to execute**: No cold start latency
- **Simple to understand**: Self-contained functions
- **Perfect for prototyping**: Quick iteration without infrastructure overhead

## Key Benefits

### Rapid Prototyping

Inline tools are ideal for quickly testing tool concepts and agent interactions without the overhead of creating full Lambda deployments.

### Zero Infrastructure Overhead

No need to manage separate Lambda functions, IAM roles, or deployment pipelines. The tool code is embedded directly in the agent configuration.

### Instant Execution

No cold start delays or network calls to separate services. Tools execute immediately within the agent runtime.

### Simple Development Flow

Write a TypeScript function, and the framework automatically transpiles it to JavaScript and embeds it in your agent.

## Example: Random Number Generator

Here's a complete example of an inline tool that generates random numbers:

```js
function random(event, params) {
    console.log('Random number generator tool called with params:', params);

    let min = params.min;
    let max = params.max;
    let range = max - min;
    let val = Math.random() * range + min;
    let factor = Math.pow(10, params.precision ?? 0);
    return Math.round(val * factor) / factor;
}
```

This tool accepts `min`, `max`, and optional `precision` parameters and returns a random number within the specified range.

## When to Use Inline Tools

### Ideal Use Cases

- **Prototyping**: Testing agent behavior with new tool concepts
- **Simple utilities**: Math calculations, string formatting, data transformations
- **Learning**: Understanding how tools work before building production versions
- **Testing**: Creating mock tools for development and testing

### Not Recommended For

- **Production workloads**: Use Lambda-based tools for production systems
- **Complex logic**: Functions requiring external dependencies or significant computation
- **External integrations**: APIs, databases, or third-party services
- **Long-running operations**: Inline tools should complete quickly

## Limitations

### Code Constraints

- Must be a single, standalone function
- No imports or external dependencies
- Cannot access AWS services directly
- Limited execution time and memory

### TypeScript Support

While you write inline tools in TypeScript, they're transpiled to JavaScript for execution. Complex TypeScript features may not be available.

### Production Considerations

Inline tools are primarily intended for development, prototyping, and testing. For production applications, consider using Lambda-based tools for better scalability, monitoring, and maintenance.

## Sample Project

The [random-num-inline sample project](https://github.com/rithum/pika/tree/main/services/samples/random-num-inline) demonstrates a complete implementation of an inline tool, including:

- TypeScript tool function
- CDK stack configuration
- Function schema definition
- Agent integration
- Chat app configuration

This sample serves as a reference implementation and starting point for your own inline tools.

:::tip[Ready to build?]
Check out the [Developer Guide for Inline Tools](/docs/developer/inline-tools/) for detailed implementation instructions and best practices.
:::

## Next Steps

- [Learn how to implement inline tools](/docs/developer/inline-tools/)
- [Explore the sample project](https://github.com/rithum/pika/tree/main/services/samples/random-num-inline)
- [Understand the broader tool ecosystem](/docs/developer/customization/)
