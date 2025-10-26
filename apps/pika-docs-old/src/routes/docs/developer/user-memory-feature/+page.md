---
title: User Memory Feature
description: Configure persistent user context and preferences across chat sessions
outline: [2, 3]
---

The User Memory feature enables your AI assistants to automatically learn and remember information about users across chat sessions and chat apps, providing increasingly personalized and contextually relevant interactions.

## Overview

When enabled, this feature provides:

- **Automatic Context Learning**: Captures user preferences, domain context, and conversation insights without explicit prompting
- **Cross-Session Continuity**: Users don't need to repeat their background, preferences, or context in new conversations
- **Personalized Responses**: AI responses become more relevant and tailored to each user's specific needs and working style
- **Secure Storage**: All user memory data is encrypted and stored using AWS Bedrock Agent Core Memory within your environment

## How It Works

### 1. Memory Collection

During conversations, the system automatically:

1. **Identifies memorable information** about the user from their messages and interactions
2. **Categorizes information** according to the configured memory strategies
3. **Stores insights securely** in AWS Bedrock Agent Core Memory with user-specific isolation
4. **Updates memory** as new information becomes available or preferences change

### 2. Memory Retrieval

When users start new conversations, the system:

1. **Queries stored memories** using the active memory strategies
2. **Retrieves relevant context** based on the user's identity and conversation topic
3. **Injects memory context** into the AI prompt to provide personalized responses
4. **Limits results** according to the configured maximum per strategy

## Memory Strategies

The User Memory feature currently turns on the preferences and semantic strategies by default.
At some point in the future, the summary strategy may be supported.

### Preferences Strategy

Turned on by default when the memory feature is enabled.

Captures explicit user choices and stated preferences:

- Communication styles and format preferences
- Tool and workflow preferences
- Accessibility needs and display preferences
- Stated likes, dislikes, and working methods

**When to use**: Essential for personalizing how information is presented and ensuring consistent user experience across sessions.

### Semantic Strategy

Turned on by default when the memory feature is enabled.

Understands contextual and domain-specific information about the user:

- Professional role and industry context
- Technical expertise level and interests
- Project and domain knowledge
- Organizational context and relationships

**When to use**: Critical for providing appropriately scoped and relevant responses that match the user's expertise level and current context.

### Summary Strategy

Currently not supported.

Maintains high-level insights from past conversations:

- Key topics and themes from previous sessions
- Important decisions and outcomes
- Progress on ongoing projects or issues
- Relationship and interaction history

**When to use**: Valuable for maintaining continuity in ongoing relationships and avoiding repetitive conversations.

## Configuration

### 1. Enable at Site Level

Enable the User Memory feature in your `pika-config.ts` file:

### 2. Configuration Options

| Property                    | Type    | Description                                                                    |
| --------------------------- | ------- | ------------------------------------------------------------------------------ |
| `enabled`                   | boolean | Whether to enable user memory collection and retrieval                         |
| `maxMemoryRecordsPerPrompt` | number  | Maximum number of memory results to augment a single prompt with (default: 25) |
| `maxKMatchesPerStrategy`    | number  | Maximum number of top memory matches to include per strategy per prompt        |

## Recommended Configuration

For most chat applications, the `preferences` and `semantic` strategies are the correct ones and such they
are enabled by default when the memory feature is enabled.

**Why Preferences**: Users quickly benefit from personalized interaction styles, communication preferences, and consistent formatting without having to repeat their preferences in each session.

**Why Semantic**: Understanding user context, expertise level, and domain knowledge enables your AI to provide appropriately scoped responses from the very first interaction in new sessions.

## Chat App Overrides

Individual chat apps can override the site-level configuration to:

- **Enable/disable** the feature entirely for specific applications
- **Adjust retrieval limits** based on the complexity of typical conversations

Chat apps cannot enable User Memory if it's disabled at the site level, but they can make the configuration more restrictive or customize the number of memory events to include from each strategy.

## Security and Privacy

- **User Isolation**: Each user's memory data is completely isolated - no cross-contamination between users
- **Encrypted Storage**: All memory data is encrypted at rest and in transit using AWS security standards
- **Environment Boundary**: Memory data never leaves your AWS environment
- **Automatic Cleanup**: Memory data follows your configured retention policies

:::warning[Configuration Required]
The User Memory feature must be enabled in your site-wide `pika-config.ts` file before individual chat apps can use it. Chat apps can customize or restrict the configuration but cannot enable a site-disabled feature.
:::
