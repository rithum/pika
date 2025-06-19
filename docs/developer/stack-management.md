# Stack Management Best Practices

This guide explains how to effectively manage stacks in your Pika Framework project, including best practices for organizing your chat applications and agents.

## 🏗️ Framework Architecture Overview

### One Framework, Many Chat Apps

Pika Framework is designed as a **single installation per AWS account** that can host multiple chat applications and agents. Here's the key concept:

![Pika Framework Architecture](../svgs/framework-architecture.drawio.svg)

**Key Points:**

- **Core Pika Service** (`/services/pika`) provides the infrastructure for all chat apps
- **Each chat app** becomes a separate stack that registers with the core service
- **Multiple chat apps** can run simultaneously from the same framework
- **One installation** per AWS account is typically sufficient

## 🎯 Recommended Approach: Separate Repositories

### Why This Approach?

**Best Practice**: Create your own separate Git repository and copy the necessary components from the weather sample stack to define your chat app and agent.

#### **Benefits:**

- ✅ **Clean Separation**: Your chat app code is separate from the framework
- ✅ **Independent Development**: You can develop and deploy your chat apps independently
- ✅ **Better Version Control**: Your chat app has its own Git history and release cycle
- ✅ **Team Autonomy**: Different teams can work on different chat apps
- ✅ **Easier Maintenance**: Your code isn't mixed with framework code
- ✅ **Reusability**: You can reuse your chat app code in other projects

#### **How to Do It:**

1. **Create a New Repository**:

    ```bash
    mkdir my-chat-app-stack
    cd my-chat-app-stack
    git init
    ```

2. **Copy the Weather Sample Structure**:

    ```bash
    # Copy the weather sample structure to your new repo
    cp -r /path/to/pika/services/samples/weather/* .

    # Or manually create the structure:
    mkdir -p lib lambda bin
    ```

3. **Modify the Stack Configuration**:

    ```typescript
    // lib/stack.ts
    export class MyChatAppStack extends cdk.Stack {
        constructor(scope: Construct, id: string, props: MyChatAppStackProps) {
            super(scope, id, props);

            // Define your agent and tools
            const agentData = {
                agentId: `my-chat-app-${this.stage}`,
                basePrompt: myAgentInstruction,
                tools: [
                    {
                        toolId: `my-tool-${this.stage}`,
                        name: 'my-tool',
                        description: 'My custom tool description',
                        executionType: 'lambda',
                        functionSchema: myFunctions
                    }
                ]
            };

            // Create your Lambda function
            const myLambda = new lambda.Function(this, 'MyFunction', {
                runtime: lambda.Runtime.NODEJS_18_X,
                handler: 'index.handler',
                code: lambda.Code.fromAsset('lambda'),
                environment: {
                    MY_API_KEY: 'your-api-key'
                }
            });

            // Register your agent with Pika
            new cdk.CustomResource(this, 'MyChatApp', {
                serviceToken: props.customResourceArn,
                properties: {
                    Stage: this.stage,
                    AgentData: JSON.stringify(agentData),
                    ToolIdToLambdaArnMap: {
                        [`my-tool-${this.stage}`]: myLambda.functionArn
                    },
                    Timestamp: String(Date.now())
                }
            });
        }
    }
    ```

4. **Update Package Configuration**:

    ```json
    // package.json
    {
        "name": "my-chat-app-stack",
        "scripts": {
            "build": "tsc",
            "cdk:deploy": "cdk deploy",
            "cdk:destroy": "cdk destroy"
        },
        "dependencies": {
            "aws-cdk-lib": "^2.0.0",
            "constructs": "^10.0.0"
        }
    }
    ```

5. **Deploy Your Stack**:

    ```bash
    pnpm install
    pnpm build
    pnpm run cdk:deploy
    ```

### What to Copy from the Weather Sample

**Essential Files:**

- `lib/stack.ts` - Main stack definition (modify for your needs)
- `bin/app.ts` - CDK app entry point (update stack name)
- `lambda/` directory - Lambda function code (replace with your logic)
- `package.json` - Dependencies and scripts (update name and deps)

**What to Modify:**

- **Chat APP definition** - Update chat app
- **Agent definition** - Update agent ID, prompt, and tools
- **Lambda functions** - Replace weather API calls with your business logic
- **Environment variables** - Update with your API keys and configuration
- **Stack name** - Change from "WeatherStack" to your app name

## 🔧 Alternative Approach: Custom Stacks in Monorepo

### When to Use This Approach

You might want to create stacks in `/services/custom/` when:

- **No Existing Projects**: You don't have existing repositories to modify
- **Simple Requirements**: Your chat app is simple and doesn't warrant a separate repo
- **Rapid Prototyping**: You want to quickly test ideas before creating separate repos
- **Team Preference**: Your team prefers to keep everything in one repository

### Custom Stack Structure

```
services/custom/
├── customer-service/          # Customer service chat app
│   ├── lib/
│   │   └── stack.ts          # Custom stack definition
│   ├── lambda/               # Lambda function code
│   ├── bin/
│   │   └── app.ts            # CDK app entry point
│   └── package.json
├── data-analytics/           # Data analysis chat app
│   ├── lib/
│   │   └── stack.ts
│   ├── lambda/
│   ├── bin/
│   │   └── app.ts
│   └── package.json
└── sales-assistant/          # Sales assistant chat app
    ├── lib/
    │   └── stack.ts
    ├── lambda/
    ├── bin/
    │   └── app.ts
    └── package.json
```

### Custom Stack Example

```typescript
// services/custom/customer-service/lib/stack.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

interface CustomerServiceStackProps extends cdk.StackProps {
    customResourceArn: string;
    stage: string;
}

export class CustomerServiceStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: CustomerServiceStackProps) {
        super(scope, id, props);

        // Define your customer service agent
        const agentData = {
            agentId: `customer-service-${props.stage}`,
            basePrompt: customerServiceInstruction,
            tools: [
                {
                    toolId: `ticket-lookup-${props.stage}`,
                    name: 'ticket-lookup',
                    description: 'Look up customer support tickets',
                    executionType: 'lambda',
                    functionSchema: ticketFunctions
                },
                {
                    toolId: `knowledge-base-${props.stage}`,
                    name: 'knowledge-base',
                    description: 'Search knowledge base articles',
                    executionType: 'lambda',
                    functionSchema: knowledgeFunctions
                }
            ]
        };

        // Create Lambda functions
        const ticketLambda = new lambda.Function(this, 'TicketLookupFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda/ticket-lookup'),
            environment: {
                TICKET_API_URL: 'https://api.company.com/tickets'
            }
        });

        const knowledgeLambda = new lambda.Function(this, 'KnowledgeBaseFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('lambda/knowledge-base'),
            environment: {
                KNOWLEDGE_BASE_URL: 'https://api.company.com/knowledge'
            }
        });

        // Register with Pika
        new cdk.CustomResource(this, 'CustomerServiceAgent', {
            serviceToken: props.customResourceArn,
            properties: {
                Stage: props.stage,
                AgentData: JSON.stringify(agentData),
                ToolIdToLambdaArnMap: {
                    [`ticket-lookup-${props.stage}`]: ticketLambda.functionArn,
                    [`knowledge-base-${props.stage}`]: knowledgeLambda.functionArn
                },
                Timestamp: String(Date.now())
            }
        });
    }
}
```

## 📁 Stack Organization Strategies

### Strategy 1: Separate Repositories (Recommended)

Keep each chat app stack in its own repository:

```
pika-framework/             # Core Pika installation
├── services/
│   └── pika/              # Core framework only

customer-service-chat/      # Separate repository
├── lib/
├── lambda/
└── package.json

data-analytics-chat/        # Separate repository
├── lib/
├── lambda/
└── package.json

sales-assistant-chat/       # Separate repository
├── lib/
├── lambda/
└── package.json
```

**Pros:**

- Independent development cycles
- Smaller, focused repositories
- Team autonomy
- Easier to manage permissions
- Clean separation of concerns
- Independent version control

**Cons:**

- More repositories to manage
- Need to coordinate deployments
- Potential for code duplication

### Strategy 2: Monorepo with Custom Stacks

Keep some chat app stacks in the Pika monorepo:

```
services/
├── pika/                    # Core framework (deploy once)
├── samples/
│   └── weather/            # Sample (reference only)
└── custom/                 # Your chat app stacks (if needed)
    ├── simple-chat-app/    # Simple chat app
    └── prototype-app/      # Prototype chat app
```

**Pros:**

- Single repository to manage
- Easy to share common code
- Consistent tooling and processes

**Cons:**

- Can become large and complex
- All developers need access to the full monorepo
- Less separation of concerns

## 🔄 Deployment Workflow

### Recommended Deployment Order

1. **Deploy Core Framework** (once per AWS account):

    ```bash
    cd services/pika
    pnpm build && pnpm run cdk:deploy
    ```

2. **Deploy Chat App Stacks** (from separate repositories):

    ```bash
    # From your separate chat app repository
    cd /path/to/my-chat-app-stack
    pnpm build && pnpm run cdk:deploy

    # Or from custom stacks in monorepo
    cd services/custom/customer-service
    pnpm build && pnpm run cdk:deploy
    ```

3. **Deploy Frontend** (once):

    ```bash
    cd apps/pika-chat
    pnpm build && pnpm run cdk:deploy
    ```

### Environment Management

**Development Environment:**

- Use the same AWS account for development
- Deploy all stacks to the same region
- Use environment variables to differentiate environments

**Production Environment:**

- Consider separate AWS accounts for production
- Use different regions for global distribution
- Implement proper CI/CD pipelines

## 🎯 Best Practices Summary

### Do's ✅

- **Create separate repositories** for your chat apps (recommended)
- **Copy from the weather sample** to get started quickly
- **Use consistent naming conventions** across all stacks
- **Keep stack configurations simple** and focused
- **Test stacks locally** before deploying to AWS
- **Use environment variables** for configuration
- **Document your stack modifications** for team members

### Don'ts ❌

- **Don't modify the weather sample directly** - copy it instead
- **Don't create new stacks** unless you have a specific need
- **Don't duplicate infrastructure** across stacks unnecessarily
- **Don't ignore the core Pika service** - it's required for all chat apps
- **Don't deploy without testing** locally first
- **Don't hardcode sensitive information** in stack definitions

## 📚 Related Documentation

- [Project Structure](./project-structure.md) - Understanding your Pika project
- [AWS Deployment](./aws-deployment.md) - Deploying to AWS
- [Local Development](./local-development.md) - Running Pika locally
- [Customization Guide](./customization.md) - How to customize Pika

---

**Ready to create your first chat app stack?** Start by creating a separate repository and copying from the weather sample, then customize it for your specific needs!
