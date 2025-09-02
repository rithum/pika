# Local Development

This guide explains how to run your Pika application locally for development and testing with the minimum setup required.

This project is designed to be cloned using the `pika create-app` CLI tool, which creates a copy of this monorepo ready for customization. This guide covers the minimum steps to get everything running locally without implementing authentication, so you can test the framework quickly before adding real auth and other customizations.

## Prerequisites

Before starting, make sure you have:

1. **Node.js 22+** installed
2. **pnpm** package manager
3. **AWS CLI** configured
4. **AWS CDK** installed globally
5. **An AWS account** with appropriate permissions

### Install Required Tools

```bash
# Install pnpm (if not already installed)
npm install -g pnpm

# Install AWS CDK
pnpm install -g aws-cdk

# Install Pika CLI
pnpm install -g pika-app
```

### Configure AWS CLI

```bash
aws configure
```

Enter your AWS access key, secret key, region, and output format.

## Architecture Overview

The Pika framework consists of three main components:

- **Global Config** (`pika-config.ts`) - Project naming and configuration
- **Backend Stack** (`services/pika/`) - Core chat infrastructure "the backend service" (must be deployed to AWS)
- **Frontend Stack** (`apps/pika-chat/`) - Chat interface "the frontend webapp" (runs locally, requires backend deployed first)
- **Sample Weather Stack** (`services/samples/weather/`) - Example chat app for testing

## Quick Start Guide

### Step 1: Create Your Project

```bash
# Create a new Pika application
pika create-app my-chat-app

# Navigate to your project
cd my-chat-app
```

### Step 2: Configure Project Names (Recommended)

**Important**: Change the project names to avoid conflicts with existing deployments.

Edit `pika-config.ts` and update the project names (here I renamed pika to acmechat and pika-chat to achmechatui):

```js
export const pikaConfig: PikaConfig = {
    pika: {
        projNameL: 'acmechat',           // Change from 'pika'
        projNameKebabCase: 'acme-chat',   // Change from 'pika'
        projNameTitleCase: 'AcmeChat',    // Change from 'Pika'
        projNameCamel: 'acmeChat',        // Change from 'pika'
        projNameHuman: 'Acme Chat'        // Change from 'Pika'
    },
    pikaChat: {
        projNameL: 'acmechatui',          // Change from 'pikachat'
        projNameKebabCase: 'acme-chat-ui', // Change from 'pika-chat'
        projNameTitleCase: 'AcmeChatUI',   // Change from 'PikaChat'
        projNameCamel: 'acmeChatUI',       // Change from 'pikaChat'
        projNameHuman: 'Acme Chat UI'      // Change from 'Pika Chat'
    },
    weather: {
        projNameL: 'acmeweather',         // Change from 'weather' if desired
        projNameKebabCase: 'acme-weather', // Change from 'weather' if desired
        projNameTitleCase: 'AcmeWeather',  // Change from 'Weather' if desired
        projNameCamel: 'acmeWeather',      // Change from 'weather' if desired
        projNameHuman: 'Acme Weather'      // Change from 'Weather' if desired
    }
};
```

### Step 3: Deploy Backend Stack (Required)

The backend stack must be deployed to AWS even for local development. The frontend depends on these services.

#### Prerequisites for Backend Deployment

Before deploying the backend, you need to set up a JWT secret:

```bash
# Navigate to the backend service
cd services/pika

# Generate a JWT secret
pnpm run jwt-secret
```

This command will output a 64-character string. Copy this value and create an SSM parameter:

```bash
# Replace 'acme-chat' with your projNameKebabCase from pika-config.ts
# Replace 'test' with your desired stage (dev, test, prod, etc.)
aws ssm put-parameter \
  --name "/stack/acme-chat/test/jwt-secret" \
  --value "YOUR_64_CHARACTER_JWT_SECRET_HERE" \
  --type "SecureString"
```

#### Deploy the Backend Service

```bash
# Still in services/pika directory
# Install dependencies
pnpm install

# Build the service
pnpm build

# Bootstrap CDK (only needed once per account/region)
pnpm run cdk:bootstrap

# Deploy to AWS
STAGE=test pnpm run cdk:deploy
```

**Note**: Replace `test` with your desired stage name. This will create all the necessary AWS resources (DynamoDB tables, Lambda functions, API Gateway, etc.).

### Step 4: Deploy Weather Service Stack (Recommended for Testing)

Deploy the sample weather service to have a working chat app to test with or the chat app will be very empty:

```bash
# Navigate to the weather service
cd ../../services/samples/weather

# Install dependencies
pnpm install

# Build the service
pnpm build

# Deploy to AWS
STAGE=test pnpm run cdk:deploy
```

### Step 5: Set Up Cookie Encryption (Required for Frontend)

The frontend requires cookie encryption infrastructure. Since you're running locally (not deploying the frontend stack to AWS), you need to set this up manually:

```bash
# Navigate to the chat app
cd ../../apps/pika-chat

# Check if encryption infrastructure exists
pnpm run encryption:setup -- status

# Set up encryption infrastructure for local development
pnpm run encryption:setup -- setup
```

This creates the necessary KMS keys and SSM parameters for cookie encryption without deploying the full CloudFormation stack. Don't worry, you can still deploy for real later (all of this is idempotent).

### Step 6: Configure Frontend Environment Variables

Create a `.env.local` file in `apps/pika-chat/` with the required environment variables:

```bash
# Create the environment file
cd apps/pika-chat
touch .env.local
```

Add the following to `.env.local`:

```bash
# Basic configuration
WEBAPP_URL=http://localhost:3000

# Change to whatever you used when you deployed the back end
STAGE=test

# Legacy values (keep as-is)
PLATFORM_API_BASE_URL=leave-with-this-bogus-value
OAUTH_URL=leave-with-this-bogus-value
TOKEN_URL=leave-with-this-bogus-value
CLIENT_ID=leave-with-this-bogus-value

# Project names (match your pika-config.ts)
PIKA_SERVICE_PROJ_NAME_KEBAB_CASE=acme-chat
PIKA_CHAT_PROJ_NAME_KEBAB_CASE=acme-chat-ui

# AWS Region (set to your deployment region)
AWS_REGION=us-east-1

# Values from AWS Parameter Store (you'll need to fetch these, see below)
PIKA_S3_BUCKET=
CHAT_API_ID=
CHAT_ADMIN_API_ID=
CONVERSE_FUNCTION_URL=
TAG_DEFINITIONS_TABLE=
```

#### Get Values from AWS Parameter Store

You need to fetch the following values from AWS Parameter Store. Replace `acme-chat` with your `projNameKebabCase` and `test` with your stage:

```bash
# Get S3 bucket name
aws ssm get-parameter --name "/stack/acme-chat/test/s3/pika_bucket_name" --query "Parameter.Value" --output text

# Get Chat API ID
aws ssm get-parameter --name "/stack/acme-chat/test/api/id" --query "Parameter.Value" --output text

# Get Chat Admin API ID
aws ssm get-parameter --name "/stack/acme-chat/test/api/chat_admin_id" --query "Parameter.Value" --output text

# Get Converse Function URL
aws ssm get-parameter --name "/stack/acme-chat/test/function/converse_url" --query "Parameter.Value" --output text

# Get Tag Definitions Table
aws ssm get-parameter --name "/stack/acme-chat/test/ddb_table/pika_tag_def" --query "Parameter.Value" --output text
```

Update your `.env.local` file with these values:

```bash
# Example with actual values (yours will be different)
PIKA_S3_BUCKET=pika-files-acme-chat-test
CHAT_API_ID=abcd123456
CHAT_ADMIN_API_ID=efgh789012
CONVERSE_FUNCTION_URL=https://xyz123.lambda-url.us-east-1.on.aws/
TAG_DEFINITIONS_TABLE=pika-tag-def-acme-chat-test
```

### Step 7: Start the Frontend

```bash
# Still in apps/pika-chat directory
# Install dependencies
pnpm install

# Start the development server
pnpm run dev
```

Your application will be available at `http://localhost:3000`!

## Testing Your Setup

### 1. Main Chat Interface

Visit `http://localhost:3000` to access:

- Generic chat interface that can render any chat app
- User authentication (basic no-op auth for testing)
- Chat history management
- File upload capabilities

### 2. Weather Chat App

Visit `http://localhost:3000/chat/weather` to test:

- Weather-related queries (e.g., "What's the weather in New York?")
- Agent-based responses
- Tool orchestration
- Dynamic response generation

### 3. Sample Enterprise Site (Optional)

Start the sample embedded chat application:

```bash
# Navigate to the enterprise site sample
cd ../samples/enterprise-site

# Install dependencies
pnpm install

# Start the development server
pnpm run dev
```

Visit `http://localhost:5173` and click the AI icon in the top right to see the chat embedded in an iframe.

## Common Environment Variable Patterns

The SSM parameter paths follow this pattern:

```bash
# S3 Bucket
/stack/{projNameKebabCase}/{stage}/s3/pika_bucket_name

# APIs
/stack/{projNameKebabCase}/{stage}/api/id
/stack/{projNameKebabCase}/{stage}/api/chat_admin_id

# Functions
/stack/{projNameKebabCase}/{stage}/function/converse_url

# Tables
/stack/{projNameKebabCase}/{stage}/ddb_table/pika_tag_def
```

Where:

- `{projNameKebabCase}` = The `projNameKebabCase` from your pika config (e.g., `acme-chat`)
- `{stage}` = Your deployment stage (e.g., `test`, `dev`, `prod`)

## Troubleshooting

### Backend Deployment Issues

- Make sure your AWS credentials are configured correctly
- Ensure you have the necessary IAM permissions
- Check that the JWT secret SSM parameter exists before deploying
- Verify your region is set correctly

### Frontend Issues

- Double-check all environment variables in `.env.local`
- Make sure the backend services are deployed and running
- Verify cookie encryption setup completed successfully
- Check that AWS region matches between backend and frontend config

### Can't Connect to Backend Services

- Verify the backend stack deployed successfully
- Check that API Gateway endpoints are accessible
- Ensure your local AWS credentials can access the deployed resources

## Next Steps

Once you have the basic setup running:

1. **Implement Authentication** - Replace the no-op auth provider with your real authentication
2. **Customize the UI** - Modify the chat interface to match your branding
3. **Create Custom Chat Apps** - Build your own chat applications beyond the weather example
4. **Deploy to Production** - Follow the AWS deployment guide to deploy the full stack

## Additional Resources

- [Project Structure Guide](./project-structure.md) - Understanding the codebase organization
- [Customization Guide](./customization.md) - How to customize Pika for your needs
- [AWS Deployment Guide](./aws-deployment.md) - Deploy to production
- [Troubleshooting Guide](./troubleshooting.md) - Common issues and solutions

---

**Ready to start building?** You now have a complete Pika setup running locally with a working weather chat app to test with!
