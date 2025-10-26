# Instruction Augmentation (Semantic Directives)

The Instruction Augmentation feature provides a powerful system for dynamically enhancing agent prompts through semantic directives. This developer guide covers the technical implementation, API usage, and infrastructure integration patterns.

## Feature Architecture

### Core Components

The Instruction Augmentation system consists of several integrated components:

1. **DynamoDB Storage Layer** - Stores semantic directives
2. **Search Engine** - Intelligent directive retrieval based on scope and context
3. **LLM Selection Service** - Determines which directives are relevant for each query
4. **Prompt Injection System** - Integrates selected directives into agent prompts
5. **Custom Resources** - Infrastructure-as-code directive deployment

## Data Model

### SemanticDirective Interface

```js
export interface SemanticDirective {
    /**
     * Scope determines when this directive might be relevant. Supports:
     * - Simple: "chatapp#weather-app", "agent#sales-bot", "tool#calculator", "entity#{entityValue}"
     * - Compound: "agent#sales-bot#entity#{entityValue}"
     *
     * You don't set this value directly. Instead, you set the scopeType and scopeValue
     * from which the system will construct the scope.
     */
    scope: string;

    /**
     * The type of scope this semantic directive is associated with.
     * Supported types: 'chatapp', 'agent', 'tool', 'entity', 'agent-entity'
     */
    scopeType: InstructionAugmentationScopeType;

    /**
     * The value(s) for the scope. Type depends on scopeType:
     * - For 'chatapp', 'agent', 'tool', 'entity': string or number
     * - For 'agent-entity': {agent: string, entity: string}
     */
    scopeValue: string | number | Record<string, string | number>;

    /**
     * Unique identifier within the scope. Use descriptive names like
     * "return-policy-details" or "premium-customer-perks"
     */
    id: string;

    /**
     * Used internally to group semantic directives created by infrastructure-as-code.
     * Don't set this value directly - let the custom CloudFormation resource set it.
     */
    groupId?: string;

    /**
     * Description for the LLM selection process. Should clearly explain
     * when this directive is relevant to help the LLM make good decisions.
     */
    description: string;

    /**
     * Instructions to inject into the prompt when this directive is selected.
     * Keep focused and actionable for best LLM performance.
     */
    instructions: string;

    /** ISO 8601 timestamp of creation */
    createDate: string;

    /** User who created the directive */
    createdBy: string;

    /** User who last updated the directive */
    lastUpdatedBy: string;

    /** ISO 8601 timestamp of last update */
    lastUpdate: string;
}
```

### Scope Patterns

#### Simple Scopes

```js
// Chat app specific
'chatapp#ecommerce-store';

// Agent specific
'agent#customer-service-bot';

// Tool specific
'tool#weather-forecast-api';

// Entity specific, perhaps an account ID or company ID
'entity#123';
```

#### Compound Scopes

**Note**: Pika currently only supports these compound scopes:

- agent + entity: `agent#weather-agent#entity#{entityValue}`

```js
// Agent + Entity combination
'agent#sales-assistant#entity#123';

//INVALID:  Only agent + entity in that order currently supported
'chatapp#support-portal#tool#ticket-system';
```

### Entity-Based Scopes

Entity-based scopes enable personalized semantic directives that automatically apply based on a user's organizational context. This requires the [Entity Feature](/docs/developer/entity-feature/) to be enabled and properly configured.

#### How Entity Scopes Work

1. **Entity Configuration**: Configure the entity feature in your `pika-config.ts`:

```js
siteFeatures: {
    entity: {
        enabled: true,
        attributeName: 'accountId', // Field in user.customData containing entity ID
        displayNameSingular: 'Account',
        // ... other entity config
    }
}
```

2. **User Entity Association**: Your authentication provider populates the entity identifier:

```js
// In your authentication provider
return {
    authenticatedUser: {
        userId: 'user123',
        // ... other user fields
        customData: {
            accountId: '123', // This field name must match entity.attributeName
            email: 'user@company.com'
            // ... other custom data
        }
    }
};
```

#### Entity Scope Examples

```js
// Configuration
const entityConfig = {
    attributeName: 'companyId',
};

// User data
const user = {
    customData: {
        companyId: 'acme-corp',
        email: 'user@acme.com'
    }
};

// Resulting entity scope: 'entity#acme-corp'
const entityScope = `entity#${user.customData[entityConfig.attributeName]}`;

// Directives that would match this user:
{
    scope: "entity#acme-corp", // Direct entity match
    id: "company-policies",
    description: "Company-specific policies and procedures",
    instructions: "Always reference Acme Corp policies when discussing procedures."
}

{
    scope: "agent#support-bot#entity#acme-corp", // Compound scope match
    id: "escalation-process",
    description: "Acme Corp specific escalation procedures",
    instructions: "For Acme Corp users, escalate to their dedicated account manager for priority issues."
}
```

## Configuration

### Site-wide Feature Enable

In your `pika-config.ts`:

```js
export const siteFeatures: SiteFeatures = {
    instructionAugmentation: {
        enabled: true
    }
    // ... other features
};
```

**Important**: The Instruction Augmentation feature must be enabled at the site level before any semantic directives will be processed, regardless of how they're defined or stored.

### Chat App Integration

Once enabled site-wide, semantic directives automatically work with all chat apps. The system:

1. **Identifies context** from the current chat app, agent, and user session
2. **Queries relevant directives** based on scope matching
3. **Processes selections** through the LLM selection service
4. **Injects instructions** into the agent prompt before LLM invocation

## API Reference

### Admin APIs

#### Create or Update Directive

```js
POST /api/chat-admin/semantic-directive

{
    "semanticDirective": {
        "scope": "chatapp#weather-app",
        "id": "severe-weather-alerts",
        "description": "Safety instructions for severe weather conditions",
        "instructions": "When reporting severe weather, always emphasize safety precautions and recommend checking local authorities for emergency guidance.",
        "createdBy": "admin-user",
        "lastUpdatedBy": "admin-user"
    },
    "userId": "admin-user"
}
```

#### Delete Directive

```js
DELETE /api/chat-admin/semantic-directive

{
    "semanticDirective": {
        "scope": "chatapp#weather-app",
        "id": "severe-weather-alerts"
    },
    "userId": "admin-user"
}
```

#### Search Directives

```js
POST /api/chat-admin/semantic-directive/search

{
    "scopes": ["chatapp#weather-app"],
    "createdBy": "admin-user",
    "directiveIds": ["severe-weather-alerts", "temperature-format"],
    "createdAfter": "2024-01-01T00:00:00Z",
    "createdBefore": "2024-12-31T23:59:59Z",
    "updatedAfter": "2024-06-01T00:00:00Z",
    "updatedBefore": "2024-06-30T23:59:59Z",
    "sortOrder": "desc",
    "limit": 50,
    "includeInstructions": true,
    "paginationToken": "eyJhbGciOiJIUzI1NiJ9..."
}
```

### Client-side State Management

#### Loading Directives

```js
// In your SvelteKit client state
const siteAdminState = getSiteAdminState();

// Load all semantic directives
await siteAdminState.loadSemanticDirectives();

// Access directives
const directives = siteAdminState.semanticDirectives;
```

#### CRUD Operations

```js
// Create or update directive
await siteAdminState.sendSiteAdminCommand({
    command: 'createOrUpdateSemanticDirective',
    request: {
        semanticDirective: {
            scope: 'chatapp#my-app',
            id: 'new-directive',
            description: 'Directive description',
            instructions: 'Specific instructions for the LLM',
            createdBy: userId,
            lastUpdatedBy: userId
        },
        userId: userId
    }
});

// Delete directive
await siteAdminState.sendSiteAdminCommand({
    command: 'deleteSemanticDirective',
    request: {
        semanticDirective: {
            scope: 'chatapp#my-app',
            id: 'directive-to-delete'
        },
        userId: userId
    }
});

// Search with filters
await siteAdminState.sendSiteAdminCommand({
    command: 'searchSemanticDirectives',
    request: {
        scopes: ['chatapp#my-app'],
        includeInstructions: true
    }
});
```

## Infrastructure as Code

### CloudFormation (CDK)

Define semantic directives in your CDK stack:

<Tabs activeName="CDK TypeScript">
<TabPanel name="CDK TypeScript">

```js
import { SemanticDirectiveForCreateOrUpdate } from 'pika-shared/types/chatbot/chatbot-types';
import { gzipAndBase64EncodeString } from 'pika-shared/util/server-utils';

// Get the custom resource ARN
const semanticDirectiveCustomResourceArn = ssm.StringParameter.valueForStringParameter(
    this,
    `/stack/${pikaServiceProjNameKebabCase}/${stage}/lambda/semantic_directive_custom_resource_arn`
);

// Define your semantic directives
const semanticDirectiveData = {
    userId: `cloudformation/${this.stackName}`,
    semanticDirectives: [
        {
            scope: 'chatapp#my-app',
            id: 'welcome-message',
            description: 'Friendly welcome for new users',
            instructions: 'Start conversations with a warm welcome and brief explanation of your capabilities.',
            createdBy: `cloudformation/${this.stackName}`,
            lastUpdatedBy: `cloudformation/${this.stackName}`
        },
        {
            scope: 'agent#my-agent#entity#enterprise-corp',
            id: 'enterprise-features',
            description: 'Enterprise-specific features and capabilities for enterprise-corp',
            instructions: 'Highlight enterprise features like dedicated support, advanced analytics, custom integrations, and SLA guarantees.',
            createdBy: `cloudformation/${this.stackName}`,
            lastUpdatedBy: `cloudformation/${this.stackName}`
        }
    ]
};

// Create the custom resource
new cdk.CustomResource(this, 'MySemanticDirectives', {
    serviceToken: semanticDirectiveCustomResourceArn,
    properties: {
        Stage: stage,
        SemanticDirectiveData: gzipAndBase64EncodeString(JSON.stringify(semanticDirectiveData)),
        Timestamp: String(Date.now())
    }
});
```

</TabPanel>
</Tabs>

### Serverless Framework Plugin

Define directives in your `serverless.yml`:

<Tabs activeName="Serverless YAML">
<TabPanel name="Serverless YAML">

```
custom:
    pika:
        semanticDirectiveCustomResourceArn: ${ssm:/stack/my-pika-service/dev/lambda/semantic_directive_custom_resource_arn}
        semanticDirectives:
            - userId: 'serverless-stack'
              semanticDirectives:
                  - scope: 'chatapp#serverless-app'
                    id: 'error-handling'
                    description: 'Guidelines for handling system errors gracefully'
                    instructions: 'When system errors occur, apologize, explain the issue briefly, and offer alternative solutions or suggest trying again later.'
                    createdBy: 'serverless-stack'
                    lastUpdatedBy: 'serverless-stack'
                  - scope: 'tool#payment-processor'
                    id: 'payment-security'
                    description: 'Security reminders for payment processing'
                    instructions: 'Always remind users that we never store credit card information and all payments are processed securely through our encrypted payment gateway.'
                    createdBy: 'serverless-stack'
                    lastUpdatedBy: 'serverless-stack'
```

</TabPanel>
</Tabs>

## Database Implementation

### DynamoDB Table Schema

The `semantic-directive` table uses:

- **Partition Key**: `scope` (enables efficient scope-based queries)
- **Sort Key**: `id` (ensures uniqueness within scope)

### Global Secondary Indexes

#### GSI1_byCreatedByDate

- **Partition Key**: `created_by`
- **Sort Key**: `create_date`
- **Usage**: Query directives by creator with date ordering

#### GSI2_byId

- **Partition Key**: `id`
- **Sort Key**: `scope`
- **Usage**: Find all directives with the same ID across different scopes

### Search Query Strategy

The search implementation uses intelligent query routing:

```js
// 1. Scope-based queries (most efficient)
if (scopes?.length) {
    // Parallel queries across scopes on main table
    return searchByScopes(scopes);
}

// 2. Creator-based queries
if (createdBy) {
    // Use GSI1 for efficient creator lookup
    return searchByCreator(createdBy);
}

// 3. ID-based queries
if (directiveIds?.length) {
    // Parallel queries on GSI2
    return searchByDirectiveIds(directiveIds);
}

// 4. Full table scan (last resort)
return scanAllSemanticDirectives();
```

## Testing and Development

### Local Development

During development, you can test semantic directives:

1. **Admin Interface**: Use the site admin panel to create test directives
2. **Direct API calls**: Test API endpoints with tools like Postman
3. **Chat app integration**: Verify directives trigger in appropriate contexts
4. **LLM selection**: Monitor which directives get selected for different queries

### Testing Strategies

#### Unit Testing Directives

```js
// Test directive creation
const directive = {
    scope: 'chatapp#test-app',
    id: 'test-directive',
    description: 'Test directive for unit testing',
    instructions: 'Test instructions for validation',
    createdBy: 'test-user',
    lastUpdatedBy: 'test-user'
};

// Validate directive structure
expect(directive.scope).toMatch(/^[a-z]+#[a-z-]+$/);
expect(directive.id).toMatch(/^[a-z-]+$/);
expect(directive.instructions.length).toBeGreaterThan(10);
```

#### Integration Testing

```js
// Test end-to-end directive flow
const query = "What's our return policy?";
const context = {
    chatAppId: 'ecommerce-store',
    agentId: 'shopping-assistant',
    userType: 'premium-customer'
};

const enhancedPrompt = await augmentPrompt(basePrompt, query, context);

// Verify directive was injected
expect(enhancedPrompt).toContain('premium customers get 60-day returns');
```

### Debugging Tools

#### Admin Interface Debugging

The admin interface provides:

- **Directive search and filtering** by scope, content, or metadata
- **Usage analytics** showing which directives are selected most often
- **Context simulation** for testing directive selection logic
- **Performance metrics** for directive query and selection performance

#### Logging and Monitoring

Enable debug logging to track:

```js
// Directive retrieval process
console.log('Retrieved directives for scope:', scope, directives);

// LLM selection decisions
console.log('Selected directives:', selectedDirectives);

// Prompt injection results
console.log('Enhanced prompt length:', enhancedPrompt.length);
```

## Performance Considerations

### Query Optimization

- **Scope targeting**: Use specific scopes to minimize candidate directive sets
- **GSI utilization**: Leverage appropriate indexes for different query patterns
- **Parallel processing**: Query multiple scopes simultaneously when possible
- **Result caching**: Cache directive lookups to reduce database load

### Prompt Management

- **Instruction brevity**: Keep directive instructions concise but complete
- **Context window awareness**: Monitor total prompt length with directive injection
- **Selection efficiency**: Optimize LLM selection prompts for speed and accuracy
- **Batch processing**: Group similar directive selections when possible

### Scalability Patterns

- **Directive organization**: Structure scopes hierarchically for efficient queries
- **Cache strategies**: Implement appropriate caching at multiple layers
- **Load balancing**: Distribute directive processing across multiple instances
- **Cost monitoring**: Track LLM usage from directive selection processes

## Migration and Deployment

### Version Management

When updating directives in production:

1. **Test in staging**: Validate directive changes in a staging environment
2. **Gradual rollout**: Update directives incrementally rather than all at once
3. **Monitor impact**: Track response quality and user satisfaction after updates
4. **Rollback strategy**: Keep previous directive versions for quick rollback if needed

### Schema Evolution

The semantic directive schema supports evolution:

- **Adding fields**: New fields can be added without breaking existing functionality
- **Scope expansion**: New scope patterns can be introduced alongside existing ones
- **Instruction enhancement**: Directive instructions can be iteratively improved
- **Index optimization**: Additional GSIs can be added for new query patterns

## Security Considerations

### Access Control

- **Admin-only creation**: Only authorized users can create or modify directives
- **Scope isolation**: Users can only access directives within their authorized scopes
- **Audit logging**: All directive changes are logged with user attribution
- **Content validation**: Directive content is validated to prevent injection attacks

### Data Protection

- **Encrypted storage**: Directive data is encrypted at rest and in transit
- **Access logging**: All directive access is logged for security monitoring
- **Content scanning**: Directive instructions are scanned for sensitive information
- **Retention policies**: Implement appropriate data retention for directive history

## Best Practices

### Directive Design

- **Single responsibility**: Each directive should address one specific scenario
- **Clear descriptions**: Write descriptions that help the LLM make accurate selections
- **Actionable instructions**: Provide specific, actionable guidance in instructions
- **Regular review**: Periodically review and update directives for continued relevance

### Scope Management

- **Consistent naming**: Use clear, consistent naming conventions for scopes and IDs
- **Hierarchical organization**: Structure scopes from general to specific
- **Documentation**: Maintain clear documentation of scope meanings and usage
- **Namespace separation**: Use distinct scope prefixes for different domains

### Integration Patterns

- **Gradual adoption**: Start with simple directives and gradually add complexity
- **Performance monitoring**: Track directive impact on response times and quality
- **User feedback**: Collect user feedback on directive-enhanced responses
- **Continuous improvement**: Iteratively refine directives based on usage patterns

The Instruction Augmentation system provides a powerful foundation for dynamic, context-aware prompt enhancement. By following these technical guidelines, you can build robust, scalable implementations that enhance your AI agents' capabilities while maintaining performance and reliability.
