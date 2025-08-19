---
title: Enterprise Data Protection
description: Enterprise data security and control guarantees
outline: [2, 3]
---

The Pika platform provides enterprise-grade data protection and security through architectural design principles that ensure **complete data isolation** and **zero cross-contamination risk**.
Built entirely on Amazon Web Services with AWS AI team validation, Pika implements a security-first architecture that guarantees your data remains under your control and isolated from other organizations.

## Core Security Principle: Defense in Depth Architecture

The fundamental security design of Pika ensures that **the AI model cannot accidentally return data from the wrong user or entity** through a **defense in depth** approach with multiple independent security layers:

- **AI Model Layer**: AWS Bedrock ensures separation at the AI model level - models cannot access or modify user/entity identity context
- **Application Layer**: Your custom tools and business logic enforce organizational boundaries and data access rules
- **Infrastructure Layer**: AWS provides network isolation, database segmentation, and encrypted storage

This **multi-layered security architecture** means that even if one layer were compromised, multiple other layers continue to protect your data. **The LLM agent cannot control or modify user or entity identity context** - it functions purely as a coordinator while security is enforced at every other layer.

### How Identity Information is Secured

#### LLM Agent Control Isolation

The AI model (LLM) serving as the agent **cannot control or modify**:

- User ID or authentication context
- Entity/company/account assignment
- Cross-user session access permissions
- Administrative permissions or role assignments

The agent functions as a **coordinator** that:

- Receives the user's question
- Determines which tools to call
- Orchestrates the response based on tool results
- **Can see user identity information when tools return it** (e.g., "Who am I logged in as" tools)
- **Cannot influence WHO the request is being made on behalf of**

#### Secure Context Passing via AWS Bedrock

Critical user and entity information is passed securely using **AWS Bedrock's session management system**:

```typescript
// This data is passed to tools via Bedrock sessionAttributes and the LLM cannot set it or modify it
// and all tools ensure that LLM requests that attempt to provide such context is ignored in favor
// of the canonical data in the session.
sessionAttributes: {
    userId: simpleUser.userId,           // User making the request
    chatAppId: chatSession.chatAppId,    // Which app context
    agentId: agentAndTools.agent.agentId,// Which agent is running
    accountId: user.customData.accountId, // Entity/company context
}
```

**Key Security Benefits:**

- **No Identity Control Risk**: The LLM cannot hallucinate or modify user/entity identity since it cannot control the authentication context
- **Tool-Level Enforcement**: Each tool receives the authenticated context independently from Bedrock session state and validates permissions accordingly
- **AWS-Managed Security**: Leverages AWS Bedrock's built-in security for session state management
- **Transparent Operation**: Users can query "Who am I logged in as" and see their identity, while the system maintains security

#### Tool-Level Access Control

When the agent calls a tool (Lambda function), the tool receives:

1. **Authenticated User Context**: Passed via `sessionAttributes` from Bedrock
2. **Entity Information**: Account/company details from user's `customData`
3. **Scoped Permissions**: Only data the authenticated user/entity can access

**Example Tool Security Patterns:**

_Data Access Tool:_

```typescript
export async function handler(event: BedrockActionGroupLambdaEvent) {
    // Extract authenticated context (set by platform, not LLM)
    const userId = event.sessionAttributes.userId;
    const accountId = event.sessionAttributes.accountId;

    // Tool validates permissions and scopes data access
    const results = await fetchDataForUserAndAccount(userId, accountId);
    return results; // Only data this user/account can see
}
```

_User Identity Tool:_

```typescript
export async function whoAmIHandler(event: BedrockActionGroupLambdaEvent) {
    // Extract authenticated context (set by platform, not LLM)
    const userId = event.sessionAttributes.userId;
    const accountId = event.sessionAttributes.accountId;
    const firstName = event.sessionAttributes.firstName;
    const lastName = event.sessionAttributes.lastName;

    // Return user identity information to the LLM
    return {
        message: `You are logged in as ${firstName} ${lastName} (ID: ${userId}) representing account ${accountId}`
    };
    // LLM can see this information, but cannot modify the underlying context
}
```

## Data Protection Guarantees

### Security by Default

**Enterprise Security Out of the Box**: Pika ships with enterprise-grade security features enabled by default, requiring no additional setup or configuration:

- **Encryption Everywhere**: All data encrypted at rest and in transit from day one
- **Complete Audit Logging**: Every action, access, and decision automatically logged with immutable timestamps
- **Identity Isolation**: User and organizational context separation enforced automatically
- **Session Security**: Cryptographic session isolation and secure cookie management built-in
- **Access Controls**: Secure-by-default access policies that deny access unless explicitly granted

**No Security Configuration Required**: Unlike platforms that require extensive security hardening, Pika operates securely from the moment of deployment. All enterprise security features are enabled by default, not optional add-ons.

### Complete Organizational Data Isolation

**Zero Cross-Contamination Architecture**: Your organization's data is cryptographically isolated from all other organizations through multiple architectural layers:

- **Identity Context Immutability**: AI models cannot modify or influence organizational/user identity context
- **Session-Level Isolation**: Each session maintains strict organizational boundaries that cannot be breached
- **Database-Level Segmentation**: All data storage enforces organizational access boundaries at the infrastructure level
- **Memory Isolation**: No shared state or cross-organization data caching

### AWS Enterprise Security Foundation

**Built on Amazon Web Services**: Inherits all AWS enterprise security controls and compliance certifications:

- **Encryption Everywhere**: Data encrypted at rest (DynamoDB, S3) and in transit (TLS 1.3)
- **AWS IAM Integration**: Leverages AWS Identity and Access Management for resource-level security
- **VPC Support**: Deploy within your Virtual Private Cloud for network-level isolation
- **AWS Bedrock Security**: Inherits AWS Bedrock's enterprise-grade AI security framework
- **CloudTrail Integration**: Complete audit trail of all system access and data operations
- **AWS Compliance**: Inherits AWS SOC, ISO, and other enterprise compliance certifications

### Authentication Independence

**Your Authentication, Your Control**: Pika integrates with your existing enterprise authentication without compromising it:

- **Bring Your Own Auth**: Compatible with any enterprise SSO, SAML, OAuth, or custom authentication system
- **Zero Trust Model**: Every data access request validated against organizational boundaries
- **Fail-Secure Design**: Security failures result in access denial, never unauthorized data exposure
- **No Shared Secrets**: No shared authentication credentials between organizations

## Enterprise Data Control & Compliance

### Data Residency and Control

**Full Control Over Your Data**: Deploy and maintain complete control over where and how your data is processed:

- **Private VPC Deployment**: Isolate all data processing within your Virtual Private Cloud
- **Data Locality**: All AI processing happens within your designated AWS infrastructure
- **AWS Data Containment**: Your data never leaves the AWS environment - all processing occurs within AWS Bedrock and your designated AWS resources

### Zero AI Training on Customer Data

**Explicit AWS Bedrock Guarantee**: Your data is completely protected from AI model training:

- **AWS Bedrock Commitment**: AWS Bedrock models **never retain customer prompts or responses** - this is AWS's explicit commitment to enterprise customers
- **No Model Training**: Your conversations, data, and business information are **never used to train or improve any AI models**
- **Ephemeral Processing**: All AI interactions are processed in real-time and discarded immediately after response generation
- **Data Quarantine**: Customer data is kept completely separate from any model training pipelines or data collection processes

**Enterprise Guarantee**: Unlike other AI platforms that may use customer interactions to improve their models, Pika + AWS Bedrock provides absolute assurance that your data remains your data, forever.

### Compliance and Audit Capabilities

**Enterprise-Grade Compliance**: Built-in support for regulatory and corporate governance requirements:

- **Complete Audit Trails**: Every user action, data access, and AI interaction logged with timestamps and attribution
- **Data Lineage Tracking**: Full visibility into how data flows through the system and AI interactions
- **Immutable Logs**: All security and access logs stored in tamper-proof AWS CloudTrail
- **Retention Controls**: Configurable data retention policies to meet compliance requirements
- **Access Reporting**: Automated reporting capabilities for security audits and compliance reviews
- **GDPR/CCPA Ready**: Built-in data privacy controls and right-to-delete capabilities

## Security Architecture Validation

### AWS Partnership & Validation

**Enterprise Assurance**: Security architecture reviewed by AWS AI specialists:

- **AWS AI Team Review**: Direct review of security implementation by Amazon Web Services AI experts
- **Best Practices Compliance**: Adherence to AWS Well-Architected Framework security pillar
- **Regular Security Updates**: Automatic inheritance of AWS security patches and improvements

### Enterprise Integration

**Seamless Security Integration**: Works within your existing enterprise security framework:

- **SIEM Integration**: Compatible with enterprise Security Information and Event Management systems
- **Identity Provider Integration**: Works with any enterprise identity management system
- **Network Security**: Full compatibility with enterprise firewall and network security policies
- **Compliance Frameworks**: Supports SOC 2, ISO 27001, GDPR, HIPAA, and other enterprise compliance requirements

## Security Guarantees Summary

**For Enterprise Decision Makers**:

1. **Defense in Depth Security**: Multiple independent security layers (AI model, application, infrastructure) protect your data
2. **Zero Cross-Organization Data Leakage**: Architectural guarantee that organizations cannot access each other's data
3. **AWS Bedrock No-Training Guarantee**: Your data never retains in AI models or gets used for training (AWS commitment)
4. **Security by Default**: All enterprise security features enabled out-of-the-box, no configuration required
5. **Complete AWS Data Containment**: Your data never leaves the AWS environment during processing
6. **Complete Audit Trail**: Every action, access, and decision is logged immutably for compliance and investigation
7. **Enterprise-Grade Encryption**: End-to-end encryption matching or exceeding banking industry standards
8. **Regulatory Compliance**: Architecture designed to support major enterprise compliance frameworks

**Bottom Line**: Pika provides enterprise-grade data protection with the security assurance that your data remains completely under your organization's control, with zero risk of cross-contamination or unauthorized access.
