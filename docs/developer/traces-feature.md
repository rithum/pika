# Traces Feature

The Traces feature provides visibility into how the LLM (Large Language Model) processes and responds to user messages. When enabled, it displays detailed traces showing the reasoning process, tool invocations, and any failures that occur during message processing.

## Overview

When enabled, this feature provides:

- **Orchestration Traces**: Shows the fundamental reasoning process of the LLM
- **Failure Traces**: Displays the reason the LLM failed to answer the user's question
- **Tool Invocation Traces**: Displays how the LLM invoked various tools during processing
- **Response Verification Traces**: Shows verification grades when the verify response feature is also enabled

## Types of Traces

### 1. Orchestration Traces

These traces show the step-by-step reasoning process of the LLM:

- Decision-making rationale
- Planning and strategy selection
- High-level reasoning steps

### 2. Failure Traces

When the LLM encounters issues, these traces show:

- Specific error messages
- Root cause analysis
- Failed execution paths

### 3. Tool Invocation Traces (Detailed Traces)

Shows how the LLM interacted with external tools:

- Tool names and versions
- Input parameters
- Output results

**Note**: Parameter traces are only shown when the `detailedTraces` feature is explicitly enabled, as they contain sensitive implementation details.

### 5. Response Verification Traces

When the verify response feature is enabled, these traces show:

- Verification grades (A, B, C, F)
- Accuracy assessments
- Auto-reprompt decisions

## Configuration

### 1. Enable at Site Level

In your `pika-config.ts`, enable the traces feature:

```typescript
export const pikaConfig: PikaConfig = {
    // ... other configuration
    siteFeatures: {
        traces: {
            enabled: true,

            // Optional: Configure detailed traces
            detailedTraces: {
                enabled: true,
                userTypes: ['internal-user'], // Only show detailed traces to internal users
                userRoles: ['pika:content-admin'], // Or specific roles
                applyRulesAs: 'or' // User needs either userType OR userRole
            }
        }
    }
};
```

### 2. Configuration Options

| Property         | Type           | Description                                             |
| ---------------- | -------------- | ------------------------------------------------------- |
| `enabled`        | boolean        | **Required.** Whether to enable the traces feature      |
| `userTypes`      | string[]       | User types that can see traces                          |
| `userRoles`      | PikaUserRole[] | User roles that can see traces                          |
| `applyRulesAs`   | 'and' \| 'or'  | How to combine userTypes and userRoles (default: 'and') |
| `detailedTraces` | AccessRules    | Additional access rules for detailed traces             |

### 3. Access Rules

The traces feature uses the `AccessRules` system for fine-grained access control:

```typescript
siteFeatures: {
    traces: {
        enabled: true,
        userTypes: ['internal-user'],
        userRoles: ['support-agent'],
        applyRulesAs: 'and', // User must be internal-user AND have support-agent role
        detailedTraces: {
            enabled: true,
            userTypes: ['internal-user'],
            userRoles: ['pika:content-admin'],
            applyRulesAs: 'or' // User needs internal-user OR content-admin role
        }
    }
}
```

## Chat App Level Overrides

Individual chat apps can override the site-level configuration:

```typescript
// In your chat app definition
const myChatApp: ChatApp = {
    chatAppId: 'my-chat-app',
    // ... other properties
    features: {
        traces: {
            featureId: 'traces',
            enabled: true, // Can only disable if site level is enabled
            userTypes: ['internal-user', 'admin'],
            detailedTraces: {
                enabled: true,
                userTypes: ['admin'] // More restrictive than site level
            }
        }
    }
};
```

### Override Rules

- **Site level controls availability**: If traces are disabled at the site level, chat apps cannot enable them
- **Chat apps can only restrict**: Chat apps can make access more restrictive but not more permissive
- **Independent detailed traces**: Chat apps can have different rules for detailed traces vs. basic traces

## User Experience

### 1. Trace Display

When traces are enabled, users will see:

- **Expandable trace sections** at the top of AI responses
- **Grouped traces** by type (orchestration, tool invocations, failures)
- **Syntax highlighting** for JSON and code traces
- **Verification badges** showing response quality grades

### 2. Trace Categories

Traces are automatically categorized and displayed:

- **Text traces**: General reasoning and rationale
- **Tool invocation traces**: Grouped by tool with parameters and results
- **Verification traces**: Response quality assessments
- **Failure traces**: Error messages and diagnostics

### 3. Detailed Traces

When detailed traces are enabled, users additionally see:

- **Raw parameter data** passed to tools
- **Complete input/output chains**
- **Internal execution details**
- **Performance metrics**

## Implementation Details

### 1. Trace Processing

Traces are processed through the following pipeline:

1. **Trace Collection**: AWS Bedrock generates traces during LLM execution
2. **Trace Parsing**: Custom handlers parse trace data into structured format
3. **Trace Grouping**: Similar traces are grouped for better display
4. **Access Control**: User permissions are checked before displaying traces
5. **Rendering**: Traces are rendered with appropriate formatting and syntax highlighting

### 2. Trace Handler

The system uses a metadata handler to process trace tags:

```typescript
// Trace metadata handler automatically processes <trace> tags
export function traceMetadataHandler(segment: MetadataTagSegment, message: ChatMessageForRendering, _chatAppState: ChatAppState, _appState: AppState): void {
    // Parses trace data and adds to message.traces array
}
```

## Troubleshooting

### Common Issues

1. **Traces not appearing**: Check that the feature is enabled at site level and user has appropriate permissions
2. **Detailed traces missing**: Verify that `detailedTraces` is enabled and user meets access requirements

### Debug Steps

1. **Check site configuration**: Verify `siteFeatures.traces.enabled = true`
2. **Verify user permissions**: Ensure user has required userType and/or userRoles
3. **Review chat app overrides**: Check if chat app has disabled or restricted traces
4. **Test with different users**: Try with users of different types/roles

## Example: Complete Configuration

```typescript
export const pikaConfig: PikaConfig = {
    // ... other configuration
    siteFeatures: {
        traces: {
            enabled: true,
            userTypes: ['internal-user'], // Only internal users see traces
            detailedTraces: {
                enabled: true,
                userTypes: ['internal-user'],
                userRoles: ['pika:content-admin', 'developer'],
                applyRulesAs: 'or' // Internal users OR admins/developers
            }
        }
    }
};
```

## Related Features

- **[Verify Response Feature](./verify-response-feature.md)**: Adds verification traces to the display
- **[Content Admin Feature](./content-admin.md)**: Allows admins to see traces for other users
- **[Overriding Features](./overriding-features.md)**: How to override trace settings per chat app

---

**Need more help?** Check the [Troubleshooting Guide](./troubleshooting.md) or review the [Customization Guide](./customization.md) for advanced configuration options.
