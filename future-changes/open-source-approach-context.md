# Pika Framework Open Source Approach - Context Summary

## Current Architecture Overview

**Pika** is an open source framework for building chat applications within AWS with the following components:

### Core Components

1. **Pika Chat** (`/apps/pika-chat`) - Generic chatbot frontend built with Svelte 5 and SvelteKit

    - URL pattern: `/chat/<chat-app-id>` (e.g., `/chat/weather`)
    - Uses generic backend stack for agent materialization

2. **Pika Backend** (`/services/pika`) - Generic backend service

    - Performs DynamoDB lookups for agent and chat app definitions
    - Creates Bedrock inline agents dynamically with instructions and functions
    - Materializes agents on-demand

3. **Sample Implementations**
    - **Weather App** (`/services/weather`) - Demonstrates CloudFormation custom resource for creating agent/chat app definitions
    - **Enterprise Site** (`/apps/enterprise-site`) - Shows preferred iframe embedding approach for existing web applications

## The Customization Challenge

### Core Problem

Engineers who clone the open source project need to:

- **Customize critical components** (especially authentication, UI components)
- **Continue synchronizing** with upstream changes
- **Deploy with confidence** using their own infrastructure patterns

### Specific Customization Pain Points

#### 1. Authentication (`/apps/pika-chat/src/hooks.server.ts`)

- Currently mocked out with hardcoded test user
- Every company has different auth requirements:
    - Different OAuth providers
    - Custom callback URL constraints
    - Post-authentication user data enrichment
    - Permission system integration
    - Enterprise SSO requirements

#### 2. Custom Component Renderers

- LLM agents return structured components like `<chart>` or `<order-window>`
- Companies need to define their own component library
- These components must integrate with their existing design systems

#### 3. Service Organization Preferences

- **Large/Sophisticated Companies**: Want separate microservice stacks, won't embed in monorepo
- **Smaller Companies**: Want to embed new chat apps directly in monorepo for simplicity
- Current workaround: Add to services directory but ignore in `.gitignore` (not ideal)

## Proposed Solution: Template-Based Architecture

### Approach

- **CLI Tool/Command**: Initial project setup with configuration questions
- **Designated Customization Areas**: Specific directories/files designed for user modifications
- **Upstream Sync Strategy**: Pull updates without conflicts to user customizations
- **Flexible Deployment**: Support both embedded and separate service patterns

### Key Design Principles

1. **Convention over Configuration**: Sensible defaults with clear customization points
2. **Non-breaking Updates**: Core framework changes don't conflict with user code
3. **Developer Experience**: Simple setup, clear documentation, confident customization
4. **AWS-focused**: Optimized for AWS deployment patterns and services

### Success Criteria

- Engineers can customize auth, components, and services without fear
- Upstream updates integrate cleanly without manual conflict resolution
- Framework supports both simple embedded and complex microservice architectures
- Clear separation between "framework code" and "user code"
