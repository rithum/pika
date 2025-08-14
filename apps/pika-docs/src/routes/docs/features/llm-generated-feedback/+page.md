---
title: LLM Generated Feedback
description: Explains how the platform uses an LLM to auto-generate feedback
outline: [2, 3]
---

After a session completes, an LLM reviews it and writes objective feedback. You get actionable suggestions without manual triage.

![Feedback AI](/assets/img/feedback-ai.png 'Feedback AI')

## What gets generated

- Summary of the session goal and outcome
- Strengths and issues observed in answers
- Suggestions for prompts, tools, or content

## Where it goes

- Stored alongside the session in DynamoDB
- Indexed in OpenSearch for exploration in the Admin Site

## Benefits

- Close the loop on quality with minimal effort
- Spot recurring gaps and prioritize fixes

:::note[Non-blocking]
Feedback is asynchronous and never slows down end‑user chats.
:::
