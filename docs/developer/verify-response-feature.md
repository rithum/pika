# Verify Response Feature

The Verify Response feature automatically evaluates the accuracy and quality of AI responses using another LLM agent invocation, providing transparency into response reliability and enabling automatic correction of inaccurate answers.

## Overview

When enabled, this feature provides:

- **Response Verification**: Automatically evaluates the veracity of AI responses
- **Quality Grading**: Assigns accuracy grades (A, B, C, F) to responses
- **Auto-Reprompting**: Automatically retries questions when responses fall below quality thresholds
- **Transparency**: Shows users the verification grade for each response
- **Quality Assurance**: Helps maintain high standards for AI responses

## How It Works

### 1. Verification Process

For each AI response, the system:

1. **Generates Initial Response**: The LLM provides an answer to the user's question
2. **Verification Analysis**: A separate verification process evaluates the response accuracy using another LLM agent
3. **Grade Assignment**: The response receives a grade (A, B, C, or F)
4. **Auto-Reprompt Decision**: If the grade falls below the configured threshold, the system automatically retries
5. **Trace Display**: The verification grade is shown to users (if traces are enabled)

### 2. Quality Grades

The system uses a four-tier grading system:

| Grade | Classification                     | Description                                                      |
| ----- | ---------------------------------- | ---------------------------------------------------------------- |
| **A** | Accurate                           | The response is factually accurate and complete                  |
| **B** | Accurate with Stated Assumptions   | The response is accurate but contains clearly stated assumptions |
| **C** | Accurate with Unstated Assumptions | The response is accurate but contains unstated assumptions       |
| **F** | Inaccurate                         | The response is inaccurate or contains made-up information       |

## Configuration

### 1. Enable at Site Level

In your `pika-config.ts`, enable the verify response feature:

```typescript
export const pikaConfig: PikaConfig = {
    // ... other configuration
    siteFeatures: {
        verifyResponse: {
            enabled: true,

            // Optional: Configure auto-reprompt threshold
            autoRepromptThreshold: 'C'

            // Optional: Access control
            userTypes: ['internal-user', 'external-user'],
            userRoles: ['customer-support'],
            applyRulesAs: 'or' // User needs userType OR userRole
        }
    }
};
```

### 2. Configuration Options

| Property                | Type                         | Description                                                 |
| ----------------------- | ---------------------------- | ----------------------------------------------------------- |
| `enabled`               | boolean                      | **Required.** Whether to enable the verify response feature |
| `autoRepromptThreshold` | VerifyResponseClassification | Grade threshold for auto-reprompting (B, C, or F)           |
| `userTypes`             | string[]                     | User types that can use this feature                        |
| `userRoles`             | PikaUserRole[]               | User roles that can use this feature                        |
| `applyRulesAs`          | 'and' \| 'or'                | How to combine userTypes and userRoles (default: 'and')     |

### 3. Auto-Reprompt Thresholds

Configure when the system should automatically retry:

```typescript
// Available threshold options
import { AccurateWithStatedAssumptions, AccurateWithUnstatedAssumptions, Inaccurate } from '@pika/shared/types/chatbot/chatbot-types';

// Retry only on inaccurate responses
autoRepromptThreshold: Inaccurate; // 'F'

// Retry on responses with unstated assumptions or worse
autoRepromptThreshold: AccurateWithUnstatedAssumptions; // 'C' (recommended)

// Retry on responses with any assumptions or worse
autoRepromptThreshold: AccurateWithStatedAssumptions; // 'B'

// Note: Grade 'A' (Accurate) cannot be used as a threshold since it's the highest quality
```

## Chat App Level Overrides

Individual chat apps can override the site-level configuration:

```typescript
// In your chat app definition
const myChatApp: ChatApp = {
    chatAppId: 'my-chat-app',
    // ... other properties
    features: {
        verifyResponse: {
            featureId: 'verifyResponse',
            enabled: true, // Can only disable if site level is enabled
            autoRepromptThreshold: Inaccurate, // More lenient than site level
            userTypes: ['internal-user'] // More restrictive than site level
        }
    }
};
```

### Override Rules

- **Site level controls availability**: If verification is disabled at the site level, chat apps cannot enable it
- **Chat apps can only restrict**: Chat apps can make access more restrictive but not more permissive
- **Independent thresholds**: Chat apps can set different auto-reprompt thresholds

## User Experience

### 1. Verification Display

When verification is enabled, users will see:

- **Verification badges** showing the response grade (A, B, C, F)
- **Auto-reprompt notifications** when the system retries a question
- **Improved response quality** due to automatic corrections

### 2. Trace Integration

When both verify response and traces features are enabled:

- **Verification traces** appear in the trace display
- **Grade explanations** provide context for the verification decision
- **Auto-reprompt reasoning** shows why a response was retried

### 3. Auto-Reprompt Behavior

When a response falls below the threshold:

1. **Automatic Retry**: The system automatically resends the user's question
2. **Improved Response**: The LLM generates a new corrected response, hopefully better

## Implementation Details

### 1. Verification Process

The verification process works as follows:

```typescript
// Simplified verification flow
if (features.verifyResponse.enabled) {
    // Generate main response
    let mainResponse = await invokeAgent(userQuestion);

    // Verify the response
    let verificationResult = await invokeAgentToVerifyAnswer(userQuestion, mainResponse);

    // Check if auto-reprompt is needed
    if (shouldAutoReprompt(verificationResult.grade, autoRepromptThreshold)) {
        // Generate improved response
        mainResponse = await invokeAgent(userQuestion, 'Please provide a more accurate response');
        verificationResult = await invokeAgentToVerifyAnswer(userQuestion, mainResponse);
    }

    // Add verification trace
    addVerificationTrace(verificationResult.grade);

    return mainResponse;
}
```

### 2. Grade Classification

The system uses the `VerifyResponseClassification` enum:

```typescript
export enum VerifyResponseClassification {
    Accurate = 'A', // Factually accurate
    AccurateWithStatedAssumptions = 'B', // Accurate with stated assumptions
    AccurateWithUnstatedAssumptions = 'C', // Accurate with unstated assumptions
    Inaccurate = 'F' // Inaccurate or made-up information
}
```

### 3. Auto-Reprompt Logic

Auto-reprompting is triggered when:

- The response grade is at or below the configured threshold
- Grades B, C, and F are considered "retryable" (Grade A is not)
- The feature is enabled and the user has appropriate permissions

## Performance Considerations

### 1. Response Time Impact

- **Doubled Processing**: Each response requires two LLM calls (initial + verification)
- **Auto-reprompt Overhead**: Poor responses may trigger additional retries
- **Selective Enablement**: Consider enabling only for critical chat apps

### 2. Cost Implications

- **Increased Token Usage**: Verification requires additional tokens
- **Retry Costs**: Auto-reprompted responses use more compute resources
- **Quality vs. Cost**: Balance verification benefits against increased costs

### 3. Optimization Strategies

- **Threshold Tuning**: Set appropriate thresholds to minimize unnecessary retries
- **User-based Enablement**: Enable only for users who need high accuracy
- **Chat App Targeting**: Focus on chat apps where accuracy is most critical

## Security Considerations

### 1. Access Control

- **Role-based Access**: Only authorized users can use verified responses
- **Quality Gating**: Ensure verification doesn't expose sensitive information
- **Audit Trail**: Track verification decisions for quality monitoring

### 2. Data Privacy

- **Verification Data**: Ensure verification prompts don't leak sensitive information
- **Response Filtering**: Verify that verification doesn't expose internal data
- **User Data Protection**: Maintain privacy during the verification process

## Use Cases

### 1. Customer Support

- **Accurate Information**: Ensure customers receive factually correct responses
- **Compliance**: Meet regulatory requirements for information accuracy
- **Trust Building**: Increase customer confidence in AI responses

### 2. Healthcare & Finance

- **Critical Accuracy**: Ensure responses in sensitive domains are verified
- **Regulatory Compliance**: Meet industry standards for AI-generated content
- **Risk Mitigation**: Reduce liability from inaccurate information

### 3. Internal Knowledge Management

- **Employee Training**: Provide verified information to staff
- **Policy Compliance**: Ensure AI responses align with company policies
- **Quality Assurance**: Maintain high standards for internal communications

## Troubleshooting

### Common Issues

1. **Verification not working**: Check that the feature is enabled at site level
2. **Auto-reprompt not triggering**: Verify threshold configuration and user permissions
3. **Performance degradation**: Consider adjusting thresholds or limiting user access

### Debug Steps

1. **Check site configuration**: Verify `siteFeatures.verifyResponse.enabled = true`
2. **Test threshold settings**: Try different `autoRepromptThreshold` values
3. **Monitor traces**: Enable traces to see verification grades
4. **Review user permissions**: Ensure users have required access

## Example: Complete Configuration

```typescript
export const pikaConfig: PikaConfig = {
    // ... other configuration
    siteFeatures: {
        verifyResponse: {
            enabled: true,
            autoRepromptThreshold: AccurateWithUnstatedAssumptions, // 'C'
            userTypes: ['internal-user'] // Only internal users get verified responses
        },
        traces: {
            enabled: true, // Enable to see verification grades
            userTypes: ['internal-user']
        }
    }
};
```

## Best Practices

### 1. Threshold Selection

- **Start Conservative**: Begin with `'F'` (Inaccurate) to catch only the worst responses
- **Gradually Improve**: Move to `'C'` (recommended) for better quality
- **Monitor Performance**: Track the impact on response times and costs

### 2. User Targeting

- **Critical Users First**: Enable for users who need the highest accuracy
- **Progressive Rollout**: Gradually expand to more user types
- **Feedback Loop**: Collect user feedback on response quality

## Related Features

- **[Traces Feature](./traces-feature.md)**: Displays verification grades and reasoning
- **[Content Admin Feature](./content-admin.md)**: Allows admins to see verification for other users
- **[Overriding Features](./overriding-features.md)**: How to override verification settings per chat app

---

**Need more help?** Check the [Troubleshooting Guide](./troubleshooting.md) or review the [Customization Guide](./customization.md) for advanced configuration options.
