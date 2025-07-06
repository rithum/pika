# Chat Disclaimer Notice Feature

The Chat Disclaimer Notice feature displays a disclaimer message to users before they interact with AI chat applications. This feature helps set appropriate expectations and provides legal protection by informing users about the limitations of AI-generated responses.

## Overview

When enabled, this feature provides:

- **Legal Protection**: Disclaims liability for AI-generated responses
- **User Education**: Informs users about AI limitations and appropriate use
- **Customizable Messaging**: Allows custom disclaimer text per site or chat app
- **Professional Appearance**: Seamlessly integrates with the chat interface
- **Compliance Support**: Helps meet regulatory requirements for AI disclosure

## How It Works

### 1. Display Behavior

The disclaimer notice:

1. **Appears Prominently**: Displays in the chat interface where users can easily see it
2. **Persistent Visibility**: Remains visible during the chat session
3. **User Awareness**: Ensures users understand they're interacting with AI
4. **Context-Appropriate**: Can be customized for different chat applications

### 2. Inheritance Model

The disclaimer follows a hierarchical configuration:

1. **Site-Level Default**: Set a global disclaimer for all chat apps
2. **Chat App Override**: Individual chat apps can override the site-level message
3. **Fallback Behavior**: If no disclaimer is configured, none is shown

## Configuration

### 1. Enable at Site Level

In your `pika-config.ts`, configure the chat disclaimer notice:

```typescript
export const pikaConfig: PikaConfig = {
    // ... other configuration
    siteFeatures: {
        chatDisclaimerNotice: {
            notice: "This AI-powered chat is here to help, but it may not always be accurate. For urgent or complex issues, please contact customer support. The company isn't liable for problems caused by relying solely on this chat."
        }
    }
};
```

### 2. Configuration Options

| Property | Type   | Description                                           |
| -------- | ------ | ----------------------------------------------------- |
| `notice` | string | **Required.** The disclaimer text to display to users |

### 3. Site-Level Configuration Examples

```typescript
// Example 1: Customer Support Disclaimer
siteFeatures: {
    chatDisclaimerNotice: {
        notice: 'This AI assistant provides general information and support. For urgent issues or definitive answers, please contact our human support team. We are not liable for decisions made based solely on AI responses.';
    }
}

// Example 2: Healthcare Disclaimer
siteFeatures: {
    chatDisclaimerNotice: {
        notice: 'This AI assistant provides general health information for educational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment. Always consult with qualified healthcare providers for medical concerns.';
    }
}

// Example 3: Financial Services Disclaimer
siteFeatures: {
    chatDisclaimerNotice: {
        notice: 'This AI assistant provides general financial information and should not be considered as personalized financial advice. Consult with qualified financial advisors for investment decisions. We are not liable for financial losses based on AI-generated information.';
    }
}
```

## Chat App Level Overrides

Individual chat apps can override the site-level disclaimer:

```typescript
// In your chat app definition
const myChatApp: ChatApp = {
    chatAppId: 'my-chat-app',
    // ... other properties
    features: {
        chatDisclaimerNotice: {
            featureId: 'chatDisclaimerNotice',
            notice: 'This specialized AI assistant provides information about our products. For official documentation or support, please contact our technical team.'
        }
    }
};
```

### Override Examples

```typescript
// Example 1: Technical Support Chat App
features: {
    chatDisclaimerNotice: {
        featureId: 'chatDisclaimerNotice',
        notice: "This technical AI assistant helps with product support. For critical issues affecting production systems, please contact our 24/7 emergency support line at 1-800-SUPPORT."
    }
}

// Example 2: Sales Information Chat App
features: {
    chatDisclaimerNotice: {
        featureId: 'chatDisclaimerNotice',
        notice: "This AI assistant provides general product information. Pricing and availability may change. For official quotes and purchase decisions, please contact our sales team."
    }
}

// Example 3: Internal Knowledge Chat App
features: {
    chatDisclaimerNotice: {
        featureId: 'chatDisclaimerNotice',
        notice: "This internal AI assistant provides company policy information. For official policy interpretations or HR matters, please consult with your manager or HR representative."
    }
}
```

## User Experience

### 1. Display Appearance

When configured, the disclaimer:

- **Visible Placement**: Appears in a prominent location within the chat interface
- **Clear Formatting**: Uses appropriate styling to ensure readability
- **Professional Design**: Matches the overall chat application design
- **Persistent Display**: Remains visible during the chat session

### 2. User Interaction

The disclaimer notice:

- **Non-Intrusive**: Doesn't block user interaction with the chat
- **Always Available**: Users can refer back to it throughout their session
- **Context-Aware**: Displays the appropriate message for the current chat app

## Implementation Details

### 1. Resolution Logic

The system determines which disclaimer to show using this logic:

```typescript
// Simplified resolution logic
function getChatDisclaimerNotice(siteFeatures, chatApp) {
    // 1. Check if chat app has its own disclaimer
    if (chatApp.features?.chatDisclaimerNotice?.notice) {
        return chatApp.features.chatDisclaimerNotice.notice;
    }

    // 2. Fall back to site-level disclaimer
    if (siteFeatures?.chatDisclaimerNotice?.notice) {
        return siteFeatures.chatDisclaimerNotice.notice;
    }

    // 3. No disclaimer configured
    return undefined;
}
```

### 2. Feature Processing

The disclaimer is processed as part of the overridable features:

```typescript
// In the overridable features calculation
const result: ChatAppOverridableFeatures = {
    // ... other features
    chatDisclaimerNotice: siteFeatures?.chatDisclaimerNotice?.notice ?? (chatApp.features?.chatDisclaimerNotice as ChatDisclaimerNoticeFeatureForChatApp | undefined)?.notice
};
```

### 3. No Access Control

Unlike other features, the disclaimer notice does not use the `AccessRules` system:

- **Always Visible**: If configured, the disclaimer is shown to all users
- **No User Type Restrictions**: Cannot be limited to specific user types
- **Universal Display**: Applies to all users of the chat app

## Best Practices

### 1. Legal Considerations

- **Consult Legal Counsel**: Work with legal teams to develop appropriate disclaimer language
- **Regulatory Compliance**: Ensure disclaimers meet industry-specific requirements
- **Regular Review**: Periodically review and update disclaimer language

### 2. Content Guidelines

- **Clear Language**: Use plain, understandable language
- **Specific Scope**: Tailor disclaimers to the specific chat app's purpose
- **Contact Information**: Include alternative contact methods when appropriate
- **Concise Messaging**: Keep disclaimers informative but not overwhelming

### 3. User Experience

- **Readable Format**: Ensure disclaimers are easy to read and understand
- **Appropriate Tone**: Match the tone to your organization's communication style
- **Regular Updates**: Keep disclaimers current with your services and policies

## Use Cases

### 1. Customer-Facing Applications

- **Support Chat**: Disclaiming liability for AI-generated support responses
- **Product Information**: Noting that AI responses may not reflect current pricing or availability
- **General Inquiries**: Setting expectations about AI limitations

### 2. Healthcare & Medical

- **Health Information**: Disclaiming that AI responses don't constitute medical advice
- **Symptom Checking**: Directing users to consult healthcare professionals
- **Medication Information**: Warning about the need for professional medical consultation

### 3. Financial Services

- **Investment Information**: Disclaiming that AI responses aren't personalized financial advice
- **Market Data**: Noting that information may not be current or complete
- **Regulatory Compliance**: Meeting financial industry disclosure requirements

### 4. Internal Applications

- **Policy Information**: Noting that AI responses may not reflect current policies
- **HR Support**: Directing users to human HR representatives for official matters
- **Technical Support**: Clarifying when to escalate to human technical support

## Troubleshooting

### Common Issues

1. **Disclaimer not appearing**: Check that the `notice` property is configured with text
2. **Wrong disclaimer showing**: Verify chat app override configuration
3. **Formatting issues**: Review the disclaimer text for proper formatting

### Debug Steps

1. **Check site configuration**: Verify `siteFeatures.chatDisclaimerNotice.notice` is set
2. **Review chat app overrides**: Check if chat app has its own disclaimer configuration
3. **Test with different chat apps**: Verify that each chat app shows the appropriate disclaimer
4. **Inspect frontend display**: Ensure the disclaimer appears correctly in the user interface

## Example: Complete Configuration

```typescript
export const pikaConfig: PikaConfig = {
    // ... other configuration
    siteFeatures: {
        chatDisclaimerNotice: {
            notice: 'This AI-powered chat assistant provides information and support. While we strive for accuracy, responses may not always be complete or current. For urgent matters, critical decisions, or official information, please contact our human support team. We are not liable for decisions made based solely on AI-generated responses.'
        }
    }
};

// Chat app with specialized disclaimer
const customerSupportApp: ChatApp = {
    chatAppId: 'customer-support',
    title: 'Customer Support Chat',
    // ... other properties
    features: {
        chatDisclaimerNotice: {
            featureId: 'chatDisclaimerNotice',
            notice: 'Our AI support assistant can help with common questions and issues. For complex problems, billing inquiries, or account changes, please contact our human support team at support@company.com or 1-800-SUPPORT.'
        }
    }
};
```

## Related Features

- **[Overriding Features](./overriding-features.md)**: How chat apps can override site-level settings
- **[Customization Guide](./customization.md)**: General guide to configuring site features
- **[Content Admin Feature](./content-admin.md)**: Administrative features for monitoring chat interactions

---

**Need more help?** Check the [Troubleshooting Guide](./troubleshooting.md) or review the [Customization Guide](./customization.md) for advanced configuration options.
