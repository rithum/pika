# Local Development

This guide explains how to run your Pika application locally for development and testing.

## 📋 Prerequisites

Before running locally, make sure you have:

1. **Node.js 22+** installed
2. **pnpm** package manager
3. **AWS CLI** useful for aws config/auth
4. **AWS CDK** installed globally

### Install AWS CDK

```bash
pnpm install -g aws-cdk
```

### Configure AWS CLI

```bash
aws configure
```

Enter your AWS access key, secret key, region, and output format.

## 🏗️ Local Development Architecture

When running locally, Pika uses a hybrid approach:

- **Frontend**: Runs locally on your machine
- **Backend Services**: Deployed to AWS (required for functionality)
- **Sample Services**: Deployed to AWS for testing

This approach ensures you're testing against the same infrastructure you'll use in production.

## 🔧 Step-by-Step Local Setup

### 1. Configure Your Project

First, update your project configuration:

```bash
# Edit pika-config.ts to update project names (used for stack/resource names)
# This is recommended to avoid conflicts with other projects
```

**Example configuration:**

```typescript
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

### 2. Deploy Backend Services

The frontend depends on the backend services, so you need to deploy them first:

#### Deploy Core Backend Service

```bash
# Navigate to the core Pika backend service
cd services/pika

# Build the service
pnpm build

# Deploy to AWS (make sure you are AWS local config is set to where you want to deploy)
pnpm run cdk:deploy
```

#### Deploy Sample Weather Service

```bash
# Navigate to the weather service
cd services/weather

# Build the service
pnpm build

# Deploy to AWS
pnpm run cdk:deploy
```

### 3. Start the Frontend

```bash
# Navigate to the chat application
cd apps/pika-chat

# Build the application
pnpm build

# Start the development server
pnpm run dev
```

### 4. Access Your Application

- **Main Chat Interface**: `http://localhost:3000`
- **Weather Chat App**: `http://localhost:3000/chat/weather`
- **Sample Enterprise Site**: `http://localhost:3000/samples/enterprise-site`

### 5. Start the Enterprise Site Front End

Make sure the main chat interface is running (see #4).

```bash
# Navigate to the chat application
cd apps/samples/enterprise-site

# Build the application
pnpm build

# Start the development server
pnpm run dev
```

Then access it with `http://localhost:5173`. Click the AI icon top right to show the pika chat front end embedded in an iframe.

## 🎯 What You Can Test Locally

### 1. Generic Chat Interface

The main chat interface at `http://localhost:3000` provides:

- User authentication
- Chat history management
- File upload capabilities
- Custom component rendering

### 2. Weather Chat Application

Visit `http://localhost:3000/chat/weather` to test:

- Agent-based weather queries
- Tool orchestration
- Dynamic response generation
- Rich media rendering

### 3. Embedded Chat Mode

Visit `http://localhost:5173` to test. The sample enterprise site demonstrates:

- Iframe integration
- Embedded chat functionality
- Cross-origin communication
- Responsive design

## 🔧 Development Workflow

### Making Changes

1. **Custom Components**: Add components in the custom-markdown-tag-components directory
2. **Frontend Stack Changes**: Use `apps/pika-chat/infra/lib/stacks/custom-stack-defs.ts` to customize stack
3. **Authentication**: Modify the auth-provider directory
4. **Backend Stack Changes**: Use `services/pika/lib/stacks/custom-stack-defs.ts` to customize stack

### Hot Reloading

The frontend development server supports hot reloading:

- Changes to Svelte components reload automatically
- TypeScript compilation happens in real-time
- CSS changes are applied immediately

### Debugging

#### Frontend Debugging

```bash
# Start with debugging enabled
pnpm run dev -- --debug

# Check browser console for errors
# Use browser dev tools for component inspection
```

#### Backend Debugging

```bash
# Check CloudWatch logs for Lambda functions
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/mycompany"

# View specific function logs
aws logs tail /aws/lambda/mycompany-weather-function --follow
```

## 🐛 Common Issues

### 1. Backend Services Not Deployed

**Symptoms:**

- Frontend loads but chat doesn't work
- 404 errors when trying to send messages
- "Service unavailable" errors

**Solution:**

```bash
# Deploy the backend services first
cd services/pika && pnpm build && pnpm run cdk:deploy
cd services/weather && pnpm build && pnpm run cdk:deploy
```

### 2. AWS Credentials Not Configured

**Symptoms:**

- CDK deployment fails
- "Unable to locate credentials" errors

**Solution:**

```bash
# Configure AWS CLI
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=us-east-1
```

### 3. Port Already in Use

**Symptoms:**

- "Port 3000 is already in use" error

**Solution:**

```bash
# Kill the process using port 3000
lsof -ti:3000 | xargs kill -9

# Or use a different port
pnpm run dev -- --port 3001
```

### 4. Build Errors

**Symptoms:**

- TypeScript compilation errors
- Missing dependencies

**Solution:**

```bash
# Clean and reinstall dependencies
pnpm clean
pnpm install

# Rebuild the project
pnpm build
```

## 🔄 Development Tips

### 1. Use Environment Variables

Create a `.env.local` file for local development:

```bash
# .env.local
VITE_API_URL=http://localhost:3000
VITE_AUTH_PROVIDER=local
VITE_DEBUG=true
```

### 2. Monitor AWS Costs

Local development still uses AWS resources:

- Monitor your AWS billing dashboard
- Use AWS Cost Explorer to track expenses
- Consider using AWS Free Tier for development

### 3. Use AWS CloudWatch

Monitor your deployed services:

```bash
# View recent logs
aws logs tail /aws/lambda/mycompany-pika-service --follow

# Check metrics
aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name Duration
```

### 4. Test Different Scenarios

- **Authentication flows**: Test login/logout
- **File uploads**: Test document processing
- **Custom components**: Test your custom UI components
- **Error handling**: Test various error scenarios

## 📚 Next Steps

Now that you can run Pika locally:

1. **Customize your application** - Read the [Customization Guide](./customization.md)
2. **Set up authentication** - Follow the [Authentication Setup](./authentication.md)
3. **Deploy to production** - Check out [AWS Deployment](./aws-deployment.md)
4. **Learn about the sync system** - Read [Sync System](./sync-system.md)

## 🆘 Getting Help

If you encounter issues:

1. **Check the troubleshooting guide** for common solutions
2. **Review AWS CloudWatch logs** for backend errors
3. **Check browser console** for frontend errors
4. **Search existing issues** on the [GitHub repository](https://github.com/rithum/pika)
5. **Create a new issue** with detailed error information

---

**Ready to customize your application?** Check out the [Customization Guide](./customization.md) to start building your own features!
