---
title: AWS Deployment
description: Complete guide to deploying your Pika Framework application to AWS for production use
outline: [2, 3]
---

This guide explains how to deploy your Pika application to AWS for production use.

## Overview

Pika Framework uses AWS CDK for infrastructure as code, enabling consistent deployment across environments. The deployment process involves deploying multiple stacks in the correct order.

## Prerequisites

Before deploying to AWS, ensure you have:

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **AWS CDK** installed globally
4. **Domain name** for the front end webapp URL
5. **SSL Certificate** for the front end to use SSL

### Install AWS CDK

```bash
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

Before deployment, update your project configuration:

```bash
# Edit project configuration
# pika-config.ts
```

**Example configuration:**

```js
export const pikaConfig: PikaConfig = {
    pika: {
        projNameL: 'mycompany',
        projNameKebabCase: 'mycompany',
        projNameTitleCase: 'MyCompany',
        projNameCamel: 'mycompany',
        projNameHuman: 'My Company'
    },
    pikaChat: {
        projNameL: 'mycompanychat',
        projNameKebabCase: 'mycompany-chat',
        projNameTitleCase: 'MyCompanyChat',
        projNameCamel: 'myCompanyChat',
        projNameHuman: 'My Company Chat'
    }
};
```

### 2. Set Up Authentication

Before deploying, configure your authentication provider:

```bash
# Edit the authentication provider
# apps/pika-chat/src/lib/server/auth-provider/index.ts
```

**Example authentication setup:**

```js
// Add your custom authentication logic here
// This could be OAuth, SSO, or custom authentication
export const authProvider = {
    // Your authentication configuration
};
```

### 3. Configure Frontend Stack

Edit the frontend stack configuration:

```bash
# apps/pika-chat/infra/lib/stacks/custom-stack-defs.ts
```

**Required configurations:**

- Domain name
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

### 4. Deploy Backend Services

Deploy the core backend infrastructure first:

#### Core Service

<Tabs activeName="Core Service">
  <TabPanel name="Core Service">

```bash
# Navigate to the core Pika service
cd services/pika

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

```bash
- Agent management infrastructure
- AWS Bedrock integration
- API Gateway
- Core Lambda functions
- IAM roles and policies
```

</TabPanel>
</Tabs>

**Stage Configuration:**

- By default, stacks deploy to the `test` stage
- Use the `STAGE` environment variable to specify a different stage
- Common stages: `dev`, `staging`, `prod`
- The stage is used in resource naming and configuration

### 5. Deploy Sample Services

Deploy the sample weather service:

<Tabs activeName="Weather Service">
  <TabPanel name="Weather Service">

```bash
# Navigate to the weather service
cd services/samples/weather

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

```bash
- Weather agent definition
- Weather tool Lambda function
- Agent registration with the core service
```

  </TabPanel>
</Tabs>

### 6. Deploy Frontend Application

Deploy the chat frontend:

<Tabs activeName="Frontend Deployment">
  <TabPanel name="Frontend Deployment">

```bash
# Navigate to the chat application
cd apps/pika-chat

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

```bash
  - S3 bucket for static assets
  - CloudFront distribution
  - Route 53 DNS records
  - SSL certificate (if configured)
  - Custom domain setup
```

  </TabPanel>
</Tabs>

## Domain Configuration

For production use, configure a custom domain:

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

Configure sensitive information using environment variables:

```bash
# Create environment files
echo "API_KEY=your-api-key" > .env.production
echo "DATABASE_URL=your-database-url" >> .env.production
```

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

### CloudWatch Metrics

Track application performance:

```bash
# View Lambda metrics
aws cloudwatch get-metric-statistics \
    --namespace AWS/Lambda \
    --metric-name Duration \
    --dimensions Name=FunctionName,Value=mycompany-pika-service \
    --start-time 2024-01-01T00:00:00Z \
    --end-time 2024-01-02T00:00:00Z \
    --period 3600 \
    --statistics Average
```

### AWS X-Ray

Enable distributed tracing:

```js
// Enable X-Ray in your Lambda functions
import { Tracer } from '@aws-lambda-powertools/tracer';

const tracer = new Tracer({ serviceName: 'mycompany-pika-service' });
```

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
4. **Search existing issues** on the [GitHub repository](https://github.com/rithum/pika)
5. **Create a new issue** with detailed error information

---

**Ready to deploy?** Make sure you've configured your project and authentication before starting the deployment process!
