---
title: Highly Customizable
description: Explains the many ways the platform may be customized
outline: [2, 3]
---

Adapt authentication, access, UI, and behaviors to fit your organization—without forking core code.

## Authentication and access

- Bring your own provider (OAuth, SAML, JWT, API keys, etc.).
- Assign `userType` (internal/external) and roles (e.g., `pika:content-admin`).
- Enable entity‑based access: gate apps by account, partner, or org via a field in `user.customData`.

## Feature flags and overrides

- Site‑wide defaults in config (traces, verifyResponse, suggestions, file upload, disclaimers, etc.).
- Per‑chatapp overrides replace the defaults for that chat app.
- Admin overrides can restrict or target specific users or entities—no redeploy required.

## UI hooks

- Customize prompt label, suggestions, history visibility, and left‑nav items.
- Add custom message components for rich, LLM‑driven UI via XML tags.

:::tip[Secure by default]
Features are opt‑in and access‑controlled. Explicitly set who can use what.
:::
