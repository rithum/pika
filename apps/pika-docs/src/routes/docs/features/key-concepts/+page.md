---
title: Key Concepts
description: Essential concepts for understanding the Pika platform
outline: [2, 3]
---

Understanding these core concepts will help you make the most of the Pika platform and configure it effectively for your organization.

## User Types & Authentication

**Authentication Required**

Pika requires authentication by design. The platform provides no anonymous or public access - every user must be authenticated through your enterprise authentication system before accessing any functionality.

**Internal vs External Users**

The platform distinguishes between two fundamental user types that determine access privileges and system behavior:

**External Users** represent your customers, clients, or end-users - the people your organization serves. These users typically belong to specific organizations, accounts, or departments within those organizations. The system uses entity-based access control to ensure external users only see content and sessions belonging to their organization.

**Internal Users** represent your employees, support staff, or administrators - the people who work for your organization. These users need broader access capabilities to provide customer support, system administration, and troubleshooting across all organizational boundaries while maintaining security.

**Enterprise Authentication Integration**

Pika integrates with your existing enterprise authentication infrastructure rather than replacing it. The platform supports any enterprise SSO, SAML, OAuth, or custom authentication system through a pluggable authentication provider pattern. Your authentication provider determines user types, assigns organizational membership, and provides custom data that drives access control decisions throughout the platform.

## Entities & Access Control

**What is an Entity**

An entity represents an organizational boundary within your system - typically a company, account, department, business unit, or any logical grouping that requires data separation. Entities enable multi-tenant operation where different organizations can use the same Pika deployment while maintaining complete data isolation from each other.

**Entity-Based Access Control**

When the entity feature is enabled, Pika associates each user with a specific entity through configurable attributes in their authentication data, such as `accountId`, `companyId`, or `departmentId`. This entity membership controls what chat sessions, shared content, and system features each user can access.

**Global Chat App vs Entity-Scoped Access**

Chat sessions and shared content operate in one of two access modes:

**Entity-Scoped Access** limits visibility to users within the same organizational entity. When a user from Acme Corp creates a chat session, only other Acme Corp users can access related shared content.

**Global Chat App Access** makes content accessible to any authenticated user who can access the parent chat app. This mode is useful for public chat apps or internal tools that don't require organizational boundaries.

**Entity Configuration Flexibility**

The entity feature operates at multiple levels with override capabilities. Site-wide settings establish the default entity behavior, while individual chat apps can override these settings to operate in global chat app mode regardless of the site-wide configuration. This allows you to create both private, entity-scoped chat apps and public, globally-accessible chat apps within the same Pika installation.

## Chat Apps & Multi-Tenancy

**Multiple Chat App Hosting**

Pika functions as a platform for hosting multiple chat applications, each with its own configuration, target audience, and feature set. Organizations typically deploy multiple chat apps to serve different use cases, departments, or customer segments while maintaining centralized management and shared infrastructure.

**Chat App Isolation**

Each chat app operates as an independent application with its own access controls, feature configurations, and user permissions. Users must be explicitly granted access to each chat app they should use, enabling fine-grained control over who can access what functionality.

**Per-App Feature Configuration**

While site-wide settings establish platform defaults, each chat app can customize its behavior through feature overrides. A chat app might disable file upload capabilities, modify suggestion prompts, or restrict advanced features to specific user roles while inheriting other site-wide settings.

**Deployment Modes**

Chat apps support both standalone and embedded deployment modes. Standalone mode provides a complete chat interface, while embedded mode allows integration into existing web applications through iframe embedding while maintaining full functionality and security.

## Agents & Tools Architecture

**Agents as Orchestrators**

Agents in Pika function as intelligent orchestrators that understand user requests, determine appropriate actions, and coordinate responses through tool usage. Agents run on Amazon Bedrock and stream responses while maintaining conversation context across multiple interactions.

**Tools as Capabilities**

Tools provide agents with specific capabilities through typed Lambda functions that follow defined input/output schemas. Each tool represents a discrete capability - retrieving data, performing calculations, accessing external systems, or taking actions on behalf of users. Tools enforce security boundaries and access controls independently from the agent that calls them.

**Configuration-Driven Approach**

Agents and tools are defined declaratively through configuration rather than hardcoded in the platform. This enables version control, review processes, safe rollouts, and evolution of agent capabilities without modifying core platform code. Organizations manage their agent definitions through Infrastructure as Code practices using AWS CDK or CloudFormation in their own stacks.

**Dynamic Registry**

The platform maintains a dynamic registry of agents, tools, and chat apps in DynamoDB, enabling runtime configuration changes and A/B testing without infrastructure redeployment. This registry-based approach supports experimentation and gradual rollouts while maintaining audit trails of configuration changes.

## AWS Integration & Infrastructure

**AWS-Only Deployment**

Pika exclusively runs on Amazon Web Services and leverages native AWS capabilities for security, scalability, and operational excellence. The platform uses AWS Bedrock for AI capabilities, Lambda for compute, DynamoDB for storage, API Gateway for REST APIs, and other AWS services for complete functionality.

**Infrastructure as Code**

Pika deployments use AWS CDK (Cloud Development Kit) for infrastructure provisioning and management. Organizations deploy the platform through CDK stacks that handle networking, security policies, database setup, and service configuration automatically while allowing customization for specific requirements.

**AWS Native Security**

The platform inherits enterprise-grade security from AWS services by default. This includes encryption at rest and in transit, IAM-based access controls, VPC network isolation options, and comprehensive audit logging through CloudTrail. Organizations benefit from AWS compliance certifications and security frameworks without additional configuration.

**Serverless Architecture**

Pika employs a serverless architecture that automatically scales with usage patterns while minimizing operational overhead. The platform handles traffic spikes automatically and charges only for actual usage rather than pre-provisioned capacity.

## Session Management & Memory

**Session Persistence**

Conversations in Pika persist across user sessions, maintaining full context and history for future reference. Users can resume conversations where they left off, and the system automatically generates titles and manages conversation organization.

**User Memory Across Sessions**

The platform maintains persistent user context and preferences across all sessions through AWS Bedrock's Agent Core Memory feature. This user memory learns individual preferences, communication styles, domain expertise, and working patterns to provide increasingly personalized interactions over time.

**Session Sharing & Collaboration**

Users can create secure sharing links for valuable conversations that respect organizational access controls. Shared sessions enable knowledge transfer, collaboration on complex problems, and support scenarios while maintaining security boundaries appropriate to each organization's configuration.

**Session Organization**

The pinning system allows users to bookmark important conversations - both their own sessions and shared content from others - for quick access through sidebar navigation. This creates personal knowledge bases and reference collections.

## Feature Management

**Explicit Feature Enablement**

Pika requires explicit enablement of all advanced features through configuration. The default `pika-config.ts` file contains feature settings that control platform-wide capabilities, but organizations must consciously enable features appropriate to their security requirements and use cases.

**Site-Wide Feature Defaults**

Platform administrators establish site-wide feature defaults that apply across all chat apps unless explicitly overridden. These defaults ensure consistent security postures and user experiences while allowing customization for specific use cases.

**Per-App Feature Overrides**

Individual chat apps can disable unwanted features or modify feature configurations to meet specific requirements. A customer-facing chat app might disable advanced tracing features, while an internal support app might enable detailed logging and administrative capabilities.

**Role-Based Feature Access**

Many features support role-based access controls that limit functionality to users with appropriate privileges. Internal users might access detailed conversation traces while external users see only the conversation itself, ensuring appropriate information disclosure for each user type.

## Security & Compliance

**Security by Default**

Pika implements enterprise-grade security features from initial deployment without requiring additional configuration. The platform encrypts all data at rest and in transit, maintains complete audit trails, enforces secure session management, and implements defense-in-depth architecture principles.

**Defense in Depth Architecture**

Security operates through multiple independent layers - AI model isolation, application-level access controls, and infrastructure security boundaries. This ensures that compromise of any single layer cannot expose data across organizational boundaries.

**Zero AI Training on Customer Data**

AWS Bedrock provides explicit guarantees that customer conversations and data never persist in AI models or contribute to model training. All AI interactions are processed ephemerally and discarded immediately after response generation.

**Enterprise Compliance Support**

The platform supports major enterprise compliance frameworks including SOC 2, ISO 27001, GDPR, and HIPAA through comprehensive audit logging, data retention controls, immutable security logs, and privacy-by-design architecture.

## Getting Started

Understanding these concepts prepares you to configure and deploy Pika effectively for your organization. Each concept builds on the others to create a comprehensive platform for enterprise AI chat applications.

:::tip[Next Steps]
Ready to dive deeper? Explore the [Advanced Chat Apps](/docs/features/advanced-chat-apps/) to see these concepts in action, or check the [Developer Guide](/docs/developer/getting-started/) to start implementing your first chat app.
:::

:::info[Configuration Required]
Remember that most features require explicit enablement through your `pika-config.ts` file and appropriate chat app configuration. The platform prioritizes security by defaulting to restricted access that you expand based on your requirements.
:::
