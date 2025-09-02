---
title: AWS Deployment
description: Complete guide to deploying your Pika Framework application to AWS for production use
outline: [2, 3]
---

This guide explains how to deploy your Pika application to AWS for production use.

:::info[Choose the Right Guide]

**New to Pika? Start with Local Development:**

- **[Local Development Guide](/docs/developer/local-development/)** - Faster setup, backend on AWS + frontend local
- Perfect for learning, testing, and initial development
- Uses mock authentication for quick setup so you can skip the auth step and just run front end locally

**Ready for Production? Use This Guide:**

- Full AWS deployment with custom domain and SSL
- Requires real authentication implementation
- Production-ready security and infrastructure

:::

## Overview

Pika Framework uses AWS CDK for infrastructure as code, enabling consistent deployment across environments. The deployment process involves deploying multiple stacks in the correct order.

## Prerequisites

Before deploying to AWS, ensure you have:

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **AWS CDK** installed globally
4. **Node.js 22+** and **pnpm** package manager
5. **Domain name** for the front end webapp URL (for public deployment, whether test or production)
6. **SSL Certificate** for the front end to use SSL (for public deployment, whether test or production)

### Install Required Tools

```bash
# Install pnpm (if not already installed)
npm install -g pnpm

# Install AWS CDK
pnpm install -g aws-cdk
```

### Configure AWS CLI

```bash
aws configure
```

Enter your AWS access key, secret key, region, and output format.

### Bootstrap AWS CDK (First Time Only)

If this is your first time using AWS CDK in your account/region:

```bash
cdk bootstrap
```

### Create Your Project

If you haven't already, create your project using the Pika CLI:

```bash
# Install Pika CLI
pnpm install -g pika-app

# Create your project
pika create-app my-chat-app
cd my-chat-app
```

## Deployment Architecture

Pika uses a two-stack deployment model:

### Backend Infrastructure Stack

**Purpose:** Core agent infrastructure and management

**Components:**

- AWS Bedrock integration
- Agent management infrastructure
- Tool orchestration
- Knowledge base integration
- API Gateway
- Lambda functions

### Frontend Infrastructure Stack

**Purpose:** Web application hosting and delivery

**Components:**

- CloudFront distribution
- Route 53 DNS configuration
- SSL certificate management
- Custom domain setup

## Security Checklist - Required for Production

:::warning[Critical Security Requirements]
**DO NOT DEPLOY TO PRODUCTION WITHOUT COMPLETING THIS CHECKLIST**
:::

Before deploying to production, verify each of these security requirements:

### Authentication Security

- [ ] **Custom authentication provider implemented** (not using mock provider)
- [ ] **All users assigned proper `userType`** (`internal-user` or `external-user`)
- [ ] **Authentication tested** with real user accounts
- [ ] **Session management** properly configured (timeouts, refresh tokens)
- [ ] **HTTPS enforced** in production (SSL certificates configured)

### Chat App Access Control

- [ ] **Review all chat apps** for proper `userTypesAllowed` configuration
- [ ] **Internal-only chat apps** restricted to `['internal-user']`
- [ ] **External-facing chat apps** restricted to `['external-user']` if needed
- [ ] **Admin/debug chat apps** properly restricted
- [ ] **Test access controls** with both internal and external user accounts

### Infrastructure Security

- [ ] **VPC configuration** reviewed and secured
- [ ] **IAM roles** follow least-privilege principle
- [ ] **Environment variables** contain no hardcoded secrets
- [ ] **API Gateway** properly configured with authentication
- [ ] **Lambda functions** have appropriate permissions

### Security Risk Examples

<Tabs activeName="Default Behavior">
  <TabPanel name="Default Behavior">

```js
// Accessible by internal users only (default)
const adminChatApp: ChatApp = {
    chatAppId: 'admin-tools',
    title: 'Admin Tools'
    // Missing userTypesAllowed means chat app may only be accessed by internal users by default
};
```

  </TabPanel>
  <TabPanel name="Explicit Internal">

```js
// Accessible by internal users only (explicit)
const adminChatApp: ChatApp = {
    chatAppId: 'admin-tools',
    title: 'Admin Tools',
    userTypesAllowed: ['internal-user']
};
```

  </TabPanel>
  <TabPanel name="Both Types">

```js
// Accessible by both user types
const supportChatApp: ChatApp = {
    chatAppId: 'data-anyalytics',
    title: 'Data Analytics',
    userTypesAllowed: ['internal-user', 'external-user']
};
```

</TabPanel>
</Tabs>

:::info[Critical Reading]

- [Authentication Guide](/docs/developer/authentication/) - Implementation details
- [User Types and Access Control](/docs/developer/chat-app-access-control) - Security concepts
  :::

## Step-by-Step Deployment

### 1. Configure Project Settings

**Important**: Change the project names to avoid conflicts with existing deployments.

Edit `pika-config.ts` and update the project names:

```js
export const pikaConfig: PikaConfig = {
    pika: {
        projNameL: 'mycompany',            // Change from 'pika'
        projNameKebabCase: 'mycompany',     // Change from 'pika'
        projNameTitleCase: 'MyCompany',     // Change from 'Pika'
        projNameCamel: 'mycompany',         // Change from 'pika'
        projNameHuman: 'My Company'         // Change from 'Pika'
    },
    pikaChat: {
        projNameL: 'mycompanychat',         // Change from 'pikachat'
        projNameKebabCase: 'mycompany-chat', // Change from 'pika-chat'
        projNameTitleCase: 'MyCompanyChat', // Change from 'PikaChat'
        projNameCamel: 'myCompanyChat',     // Change from 'pikaChat'
        projNameHuman: 'My Company Chat'    // Change from 'Pika Chat'
    },
    weather: {
        projNameL: 'myweather',             // Change from 'weather' if desired
        projNameKebabCase: 'my-weather',    // Change from 'weather' if desired
        projNameTitleCase: 'MyWeather',     // Change from 'Weather' if desired
        projNameCamel: 'myWeather',         // Change from 'weather' if desired
        projNameHuman: 'My Weather'         // Change from 'Weather' if desired
    }
};
```

### 2. Set Up JWT Secret (Required for Backend)

Before deploying the backend, you need to set up a JWT secret. This step is the same whether you're deploying for production or following the [Local Development Guide](/docs/developer/local-development/).

```bash
# Navigate to the backend service
cd services/pika

# Generate a JWT secret
pnpm run jwt-secret
```

This command will output a 64-character string. Copy this value and create an SSM parameter:

```bash
# Replace 'mycompany' with your projNameKebabCase from pika-config.ts
# Replace 'prod' with your desired stage (dev, test, staging, prod, etc.)
aws ssm put-parameter \
  --name "/stack/mycompany/prod/jwt-secret" \
  --value "YOUR_64_CHARACTER_JWT_SECRET_HERE" \
  --type "SecureString"
```

### 3. Set Up Authentication (Production Only)

:::warning[Production Requirement]
**DO NOT DEPLOY TO PRODUCTION** without implementing real authentication. The default auth provider is for development only.
:::

For production deployments, configure your authentication provider:

```bash
# Edit the authentication provider
# apps/pika-chat/src/lib/server/auth-provider/index.ts
```

**Example authentication setup:**

```js
// Replace the mock authentication with your real implementation
// This could be OAuth, SSO, SAML, or custom authentication
export const authProvider: AuthProvider = {
    // Your production authentication configuration
    authenticate: async (request) => {
        // Your authentication logic
    },
    // Additional auth methods...
};
```

**For detailed authentication setup**: [Authentication Guide](/docs/developer/authentication/)

### 4. Configure Frontend Stack (Production Only)

For production deployments, you'll need to configure your domain and SSL certificate.

Edit the frontend stack configuration:

```bash
# apps/pika-chat/infra/lib/stacks/custom-stack-defs.ts
```

**Required configurations for production:**

- Domain name (e.g., chat.mycompany.com)
- SSL certificate ARN
- Hosted zone ID
- VPC configuration (if needed)

**Example configuration:**

```js
export const customStackDefs = {
    domainName: 'chat.mycompany.com',
    certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/your-cert-id',
    hostedZoneId: 'Z1234567890ABCDEF'
    // Add any additional resources or configurations
};
```

### 5. Deploy Backend Services

Deploy the core backend infrastructure first. This creates all the necessary AWS resources (DynamoDB tables, Lambda functions, API Gateway, etc.).

#### Core Backend Service

<Tabs activeName="Core Service">
  <TabPanel name="Core Service">

```bash
# Navigate to the core Pika service
cd services/pika

# Install dependencies
pnpm install

# Build the service
pnpm build

# Deploy to AWS (defaults to 'test' stage)
pnpm run cdk:deploy

# Deploy to specific stage
STAGE=prod pnpm run cdk:deploy
STAGE=staging pnpm run cdk:deploy
STAGE=dev pnpm run cdk:deploy
```

  </TabPanel>
  <TabPanel name="What Gets Deployed">

- Agent management infrastructure
- AWS Bedrock integration
- API Gateway
- Core Lambda functions
- DynamoDB tables
- IAM roles and policies
- S3 buckets
- SSM parameters

</TabPanel>

</Tabs>

**Stage Configuration:**

- By default, stacks deploy to the `test` stage
- Use the `STAGE` environment variable to specify a different stage
- Common stages: `dev`, `staging`, `prod`
- The stage is used in resource naming and configuration
- Note that if you run the front end locally, that it needs to hit the deployed back end stack and by default the expectation is that it hits the back end deployed to `test`

### 6. Deploy Sample Weather Service (Recommended)

Deploy the sample weather service to have a working chat app to test with:

<Tabs activeName="Weather Service">
  <TabPanel name="Weather Service">

```bash
# Navigate to the weather service
cd ../../services/samples/weather

# Install dependencies
pnpm install

# Build the service
pnpm build

# Deploy to AWS (defaults to 'test' stage)
pnpm run cdk:deploy

# Deploy to specific stage
STAGE=prod pnpm run cdk:deploy
STAGE=staging pnpm run cdk:deploy
STAGE=dev pnpm run cdk:deploy
```

  </TabPanel>
  <TabPanel name="What Gets Deployed">

- Weather agent definition
- Weather tool Lambda function
- Agent registration with the core service
- Sample chat app for testing

</TabPanel>

</Tabs>

### 7. Deploy Frontend Application (Production Only)

:::info[Local Development vs Production]

- **For local development**: The frontend runs locally at `http://localhost:3000` - see the [Local Development Guide](/docs/developer/local-development/)
- **For production**: Deploy the frontend to AWS with custom domain and SSL
  :::

Deploy the chat frontend to AWS for production use:

<Tabs activeName="Frontend Deployment">
  <TabPanel name="Frontend Deployment">

```bash
# Navigate to the chat application
cd ../../apps/pika-chat

# Install dependencies
pnpm install

# Build the application
pnpm build

# Deploy to AWS (defaults to 'test' stage)
pnpm run cdk:deploy

# Deploy to specific stage
STAGE=prod pnpm run cdk:deploy
STAGE=staging pnpm run cdk:deploy
STAGE=dev pnpm run cdk:deploy
```

  </TabPanel>
  <TabPanel name="What Gets Deployed">

- S3 bucket for static assets
- CloudFront distribution
- Route 53 DNS records
- SSL certificate (if configured)
- Custom domain setup
- Cookie encryption infrastructure (KMS keys)

</TabPanel>

</Tabs>

**Note**: The frontend deployment automatically sets up cookie encryption infrastructure using the same system as the local development setup tool.

## Domain Configuration

For deploying publiclly use (test or prod), configure a custom domain:

1. **Purchase a domain** (if you don't have one)
2. **Create a hosted zone** in Route 53
3. **Request an SSL certificate** in AWS Certificate Manager
4. **Update the stack configuration** with your domain details

**Example configuration:**

```js
export const customStackDefs = {
    domainName: 'chat.mycompany.com',
    certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/your-cert-id',
    hostedZoneId: 'Z1234567890ABCDEF'
};
```

## Security Configuration

### IAM Roles and Policies

The deployment automatically creates necessary IAM roles:

- **Lambda execution roles** with minimal permissions
- **API Gateway roles** for service integration

### Environment Variables

For production deployment, sensitive information is managed through AWS Systems Manager (SSM) Parameters, not environment files. The deployment process automatically creates the necessary parameters.

:::info[No .env Files Needed]
Unlike local development, production deployment doesn't require `.env.local` files. All configuration is handled through:

- SSM Parameters (automatically created during deployment)
- CDK stack configuration
- AWS IAM roles and policies
  :::

### VPC Configuration

For enhanced security, configure VPC settings:

```js
export const customStackDefs = {
    vpc: {
        vpcId: 'vpc-12345678',
        subnetIds: ['subnet-12345678', 'subnet-87654321'],
        securityGroupIds: ['sg-12345678']
    }
};
```

## Monitoring and Logging

### CloudWatch Logs

Monitor your application using CloudWatch:

<Tabs activeName="Lambda Logs">
  <TabPanel name="Lambda Logs">

```bash
# View Lambda function logs
aws logs tail /aws/lambda/mycompany-pika-service --follow
```

  </TabPanel>
  <TabPanel name="API Gateway Logs">

```bash
# View API Gateway logs
aws logs tail /aws/apigateway/mycompany-api --follow
```

</TabPanel>
  
</Tabs>

## Deployment Workflow

### Development Workflow

1. **Make changes** to your code
2. **Test locally** using the local development guide
3. **Build the application** with `pnpm build`
4. **Deploy to staging** (if you have a staging environment)
5. **Deploy to production** with `pnpm run cdk:deploy`

## Common Deployment Issues

### 1. CDK Bootstrap Required

:::warning[Bootstrap Error]
**Error:** "This stack uses assets, so the toolkit stack must be deployed to the environment"
:::

**Solution:**

```bash
cdk bootstrap
```

### 2. Insufficient IAM Permissions

:::warning[Permission Error]
**Error:** "User is not authorized to perform: cloudformation:CreateStack"
:::

**Solution:**

- Ensure your AWS user has the necessary permissions
- Use an IAM role with appropriate permissions
- Contact your AWS administrator

### 3. Domain Configuration Issues

:::warning[Domain Error]
**Error:** "Certificate not found" or "Hosted zone not found"
:::

**Solution:**

    - Verify the certificate ARN is correct
    - Ensure the certificate is in the same region as your stack
    - Check that the hosted zone ID is correct
    - Verify the domain is properly configured

### 4. VPC Configuration Issues

:::warning[VPC Error]
**Error:** "VPC not found" or "Subnet not found"
:::

**Solution:**

- Verify VPC and subnet IDs are correct
- Ensure subnets are in the same region as your stack
- Check that subnets have the required tags

## Cost Monitoring

Be sure to monitor your costs.

### Resource Cleanup

To avoid unnecessary costs, clean up unused resources:

```bash
# Destroy a stack
cd services/pika
pnpm run cdk:destroy

# Or destroy all stacks
cd apps/pika-chat
pnpm run cdk:destroy
cd ../services/weather
pnpm run cdk:destroy
cd ../services/pika
pnpm run cdk:destroy
```

## Local Development vs Production Deployment

:::info[Choose Your Path]

**For Local Development (Recommended for getting started):**

- Follow the [Local Development Guide](/docs/developer/local-development/)
- Backend deployed to AWS, frontend runs locally
- Faster iteration and testing
- Uses mock authentication for quick setup

**For Production Deployment (This guide):**

- Full AWS deployment with custom domain
- Requires real authentication implementation
- SSL certificates and proper security
- Production-ready infrastructure

:::

## Next Steps

After successful deployment:

1. **Test your application** at your domain
2. **Set up monitoring** and alerting
3. **Configure backups** for critical data
4. **Set up CI/CD** for automated deployments
5. **Learn about the sync system** for framework updates

## Getting Help

If you encounter deployment issues:

1. **Check CloudFormation events** in the AWS console
2. **Review CloudWatch logs** for error details
3. **Verify IAM permissions** are sufficient
4. **Check the [Local Development Guide](/docs/developer/local-development/)** for similar setup steps
5. **Search existing issues** on the [GitHub repository](https://github.com/rithum/pika)
6. **Create a new issue** with detailed error information

---

**Ready to deploy to production?** Make sure you've implemented real authentication and configured your domain before starting the deployment process!

**Just getting started?** Consider trying the [Local Development Guide](/docs/developer/local-development/) first for faster iteration.
