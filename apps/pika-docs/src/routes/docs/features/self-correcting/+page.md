---
title: Self Correcting
description: Explains how the platform self-corrects agent responses
outline: [2, 3]
---

Improve answer quality with an independent verifier. It reviews the agent’s output, grades it, and can trigger an automatic reprompt when needed.

## How it works

- The primary agent answers the user.
- A verifier model evaluates the response for accuracy, completeness, and adherence to policy.
- The verifier assigns a grade (A/B/C/F) and optional notes.
- If enabled, the system auto‑reprompts below a threshold (e.g., C or lower) to improve the result.

## Why it matters

- Catches obvious mistakes before users see them.
- Provides transparent grades in traces for debugging and tuning.
- Lets you be aggressive for internal users and conservative for customers.

:::tip[Targeted enablement]
Enable for select user roles first (e.g., `pika:content-admin`). Expand once you’re satisfied with quality and latency trade‑offs.
:::
