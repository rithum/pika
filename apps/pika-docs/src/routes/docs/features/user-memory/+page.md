---
title: User Memory
description: Persistent user context and preferences for personalized experiences
outline: [2, 3]
---

Your AI remembers users across sessions, learning their preferences and context to deliver increasingly personalized interactions.

## How it works

User Memory automatically captures and stores information about each user during their conversations. This information is securely stored using AWS Bedrock's Agent Core Memory feature and seamlessly retrieved when the user returns for future conversations.

## What gets remembered

The system intelligently stores these types of user information:

- **Preferences**: Explicit choices, settings, and stated preferences about how the user likes to work
- **Semantic**: Semantic understanding of the user's domain, role, interests, and working environment

## Personalization in action

**Sarah's Support Experience**: Sarah contacts customer support about billing questions. During her first conversation, she mentions she's the CFO of a mid-sized manufacturing company and prefers detailed financial breakdowns. When she returns a week later with a different question, the system already knows her role and communication preferences, immediately providing the level of detail she expects.

**Marcus's Technical Consultation**: Marcus, a software architect, regularly asks about API integrations. The system learns that he works with Python, prefers code examples, and is building a microservices architecture. Future conversations automatically include relevant technical context without him having to repeat his background.

**Team Knowledge Building**: As your organization uses the system, each user builds their own knowledge profile. New team members can get immediately relevant help based on their role, while seasoned users receive increasingly sophisticated assistance that builds on their established expertise.

## The learning advantage

User Memory creates a continuous learning cycle. Each conversation makes the next one better. Users spend less time providing context and get more relevant, personalized responses from the start of each session.

This persistent context helps your AI assistants feel less like tools and more like knowledgeable colleagues who understand your team's unique needs and working styles.

:::info[Configuration required]
The User Memory feature must be enabled in your site-wide configuration and can be customized per chat app to control which memory strategies are active and how much context to retrieve.
:::
