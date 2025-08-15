---
title: Troubleshooting
description: Comprehensive troubleshooting guide for common Pika Framework issues
outline: [2, 3]
---

This guide helps you resolve common issues you might encounter when using Pika Framework.

## Quick Diagnosis

### Check Your Environment

First, verify your setup:

```bash
# Check Node.js version (should be 22+)
node --version

# Check pnpm version
pnpm --version

# Check Pika CLI version
pika --version

# Check AWS CLI (if using AWS features)
aws --version
```

### Common Error Patterns

- **Installation Issues**: Node.js version, pnpm installation, permissions
- **Build Errors**: TypeScript compilation, missing dependencies
- **Deployment Issues**: AWS credentials, CDK bootstrap, IAM permissions
- **Runtime Errors**: Environment variables, network connectivity, AWS service limits

## Installation Issues

### Node.js Version Problems

:::warning[Node.js Version Error]
**Error**: `Node.js version 22.0.0 or higher is required`
:::

**Solution**:

<Tabs activeName="macOS">
  <TabPanel name="macOS">
    ```bash
    # Check current version
    node --version

    # Update Node.js with Homebrew
    brew upgrade node
    ```

  </TabPanel>
  <TabPanel name="Linux">
    ```bash
    # Update Node.js with NodeSource
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
    ```
  </TabPanel>
  <TabPanel name="Windows">
    Download and install from [nodejs.org](https://nodejs.org/)
  </TabPanel>
</Tabs>

### pnpm Installation Issues

:::warning[pnpm Not Found]
**Error**: `pnpm: command not found`
:::

**Solution**:

<Tabs activeName="Official Installer">
  <TabPanel name="Official Installer">
    ```bash
    # Use the official installer (recommended)
    curl -fsSL https://get.pnpm.io/install.sh | sh -

    # Verify installation
    pnpm --version
    ```

  </TabPanel>
  <TabPanel name="npm">
    ```bash
    # Install pnpm globally via npm
    npm install -g pnpm

    # Verify installation
    pnpm --version
    ```

  </TabPanel>
</Tabs>

## Build Issues

### TypeScript Compilation Errors

:::warning[Build Failure]
**Error**: `TypeScript compilation failed`
:::

**Solution**:

```bash
# Run in root of project, removes all .turbo, node_modules, etc.
pnpm run clean

# In root, install all deps
pnpm install

# In root, try to build everything
pnpm build

# In root, check typescript types
pnpm run check-types
```

### Missing Dependencies

:::warning[Module Not Found]
**Error**: `Cannot find module 'xyz'`
:::

**Solution**:

```bash
# Reinstall all dependencies
pnpm install

# Clear pnpm cache
pnpm store prune

# Check for workspace issues
pnpm list --depth=0
```

### Build Script Failures

:::warning[Script Exit Code]
**Error**: `Build script failed with exit code 1`
:::

**Solution**:

<Tabs activeName="Debug Build">
  <TabPanel name="Debug Build">
    ```bash
    # Check build logs for specific errors
    pnpm build --verbose

    # Check for environment-specific issues
    echo $NODE_ENV
    ```

  </TabPanel>
  <TabPanel name="Individual Packages">
    ```bash
    # Try building individual packages
    cd apps/pika-chat && pnpm build
    cd services/pika && pnpm build
    ```
  </TabPanel>
</Tabs>

## Deployment Issues

### AWS Credentials Not Configured

:::warning[AWS Credentials]
**Error**: `Unable to locate credentials`
:::

**Solution**:

<Tabs activeName="AWS CLI">
  <TabPanel name="AWS CLI">
    ```bash
    # Configure AWS CLI
    aws configure

    # Verify credentials
    aws sts get-caller-identity
    ```

  </TabPanel>
  <TabPanel name="Environment Variables">
    ```bash
    # Set environment variables
    export AWS_ACCESS_KEY_ID=your-access-key
    export AWS_SECRET_ACCESS_KEY=your-secret-key
    export AWS_DEFAULT_REGION=us-east-1
    ```
  </TabPanel>
</Tabs>

### CDK Bootstrap Required

:::warning[CDK Bootstrap]
**Error**: `This stack uses assets, so the toolkit stack must be deployed to the environment`
:::

**Solution**:

```bash
# Bootstrap CDK in your account/region
cdk bootstrap

# Verify bootstrap
aws cloudformation describe-stacks --stack-name CDKToolkit
```

### Insufficient IAM Permissions

:::warning[IAM Permissions]
**Error**: `User is not authorized to perform: cloudformation:CreateStack`
:::

**Solution**:

- Ensure your AWS user has the necessary permissions
- Use an IAM role with appropriate permissions
- Contact your AWS administrator for proper permissions

**Required permissions**:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": ["cloudformation:*", "s3:*", "lambda:*", "apigateway:*", "iam:*", "logs:*", "cloudwatch:*"],
            "Resource": "*"
        }
    ]
}
```

### Domain Configuration Issues

:::warning[Domain Issues]
**Error**: `Certificate not found` or `Hosted zone not found`
:::

**Solution**:

<Tabs activeName="Certificate">
  <TabPanel name="Certificate">
    ```bash
    # Verify certificate exists
    aws acm list-certificates --region us-east-1

    # Check certificate ARN format
    # Should be: arn:aws:acm:region:account:certificate/cert-id
    ```

  </TabPanel>
  <TabPanel name="Hosted Zone">
    ```bash
    # Verify hosted zone exists
    aws route53 list-hosted-zones
    ```
  </TabPanel>
</Tabs>

### VPC Configuration Issues

:::warning[VPC Issues]
**Error**: `VPC not found` or `Subnet not found`
:::

**Solution**:

<Tabs activeName="VPC">
  <TabPanel name="VPC">
    ```bash
    # List VPCs
    aws ec2 describe-vpcs
    ```
  </TabPanel>
  <TabPanel name="Subnets">
    ```bash
    # List subnets
    aws ec2 describe-subnets

    # Verify subnet tags
    aws ec2 describe-subnets --subnet-ids subnet-12345678
    ```

  </TabPanel>
</Tabs>

## Runtime Issues

### Frontend Not Loading

:::caution[Frontend Issues]
**Symptoms**: Blank page, console errors, 404 errors
:::

**Solution**:

<Tabs activeName="Development Server">
  <TabPanel name="Development Server">
    ```bash
    # Check if development server is running
    lsof -i :3000

    # Check for build errors
    cd apps/pika-chat && pnpm build
    ```

  </TabPanel>
  <TabPanel name="Environment">
    ```bash
    # Check environment variables
    cat .env.local

    # Check browser console for JavaScript errors
    ```

  </TabPanel>
</Tabs>

### Backend Services Not Responding

:::caution[Backend Issues]
**Symptoms**: Chat doesn't work, API errors, 500 responses
:::

**Solution**:

<Tabs activeName="Deployment Status">
  <TabPanel name="Deployment Status">
    ```bash
    # Check if services are deployed
    aws cloudformation describe-stacks --stack-name mycompany-pika
    ```
  </TabPanel>
  <TabPanel name="Logs">
    ```bash
    # Check Lambda function logs
    aws logs tail /aws/lambda/mycompany-pika-service --follow

    # Check API Gateway logs
    aws logs tail /aws/apigateway/mycompany-api --follow
    ```

  </TabPanel>
</Tabs>

### Authentication Issues

:::caution[Authentication Issues]
**Symptoms**: Login fails, session errors, unauthorized access
:::

**Solution**:

```bash
# Check authentication provider configuration
cat apps/pika-chat/src/lib/server/auth-provider/index.ts

# Check browser cookies and local storage
# Clear browser cache and cookies if needed
```

## Sync Issues

### Sync Command Fails

:::warning[Sync Failure]
**Error**: `Failed to sync with framework`
:::

**Solution**:

<Tabs activeName="Basic Checks">
  <TabPanel name="Basic Checks">
    ```bash
    # Check internet connection
    ping github.com

    # Use debug mode for more information
    pika sync --debug
    ```

  </TabPanel>
  <TabPanel name="GitHub Access">
    ```bash
    # Check GitHub access
    curl -I https://github.com/rithum/pika

    # Try with different branch
    pika sync --branch main
    ```

  </TabPanel>
</Tabs>

### Unexpected File Overwrites

:::caution[File Overwrites]
**Symptoms**: Custom files were overwritten during sync
:::

**Solution**:

<Tabs activeName="Protection">
  <TabPanel name="Protection">
    ```bash
    # Check sync configuration
    cat .pika-sync.json

    # Add files to userProtectedAreas
    # Edit .pika-sync.json and add:
    "userProtectedAreas": ["my-custom-file.ts"]
    ```

  </TabPanel>
  <TabPanel name="Recovery">
    ```bash
    # Restore from git if available
    git checkout HEAD -- my-custom-file.ts
    ```
  </TabPanel>
</Tabs>

### Merge Conflicts

:::caution[Conflicts]
**Symptoms**: Sync stops due to conflicts
:::

**Solution**:

<Tabs activeName="Review">
  <TabPanel name="Review">
    ```bash
    # Review conflicts
    pika sync --diff

    # Resolve conflicts manually
    # Edit conflicted files and remove conflict markers
    ```

  </TabPanel>
  <TabPanel name="Protection">
    ```bash
    # Or protect the file
    # Add to userProtectedAreas in .pika-sync.json
    ```
  </TabPanel>
</Tabs>

## Debugging Tools

### Enable Debug Logging

```bash
# Enable debug mode for various commands
pika sync --debug
pnpm run dev -- --debug
cdk deploy --debug

# Check environment variables
env | grep -i pika
env | grep -i aws
```

### Log Analysis

<Tabs activeName="View Logs">
  <TabPanel name="View Logs">
    ```bash
    # View recent logs
    aws logs tail /aws/lambda/mycompany-pika-service --follow
    ```
  </TabPanel>
  <TabPanel name="Search Errors">
    ```bash
    # Search for errors
    aws logs filter-log-events \
        --log-group-name /aws/lambda/mycompany-pika-service \
        --filter-pattern "ERROR"
    ```
  </TabPanel>
  <TabPanel name="Export Logs">
    ```bash
    # Export logs for analysis
    aws logs export-task \
        --task-name "export-$(date +%s)" \
        --log-group-name /aws/lambda/mycompany-pika-service \
        --from 1640995200000 \
        --to 1641081600000 \
        --destination "mycompany-logs-bucket" \
        --destination-prefix "logs/"
    ```
  </TabPanel>
</Tabs>

### Performance Monitoring

<Tabs activeName="Lambda Metrics">
  <TabPanel name="Lambda Metrics">
    ```bash
    # Check Lambda function performance
    aws cloudwatch get-metric-statistics \
        --namespace AWS/Lambda \
        --metric-name Duration \
        --dimensions Name=FunctionName,Value=mycompany-pika-service \
        --start-time 2024-01-01T00:00:00Z \
        --end-time 2024-01-02T00:00:00Z \
        --period 3600 \
        --statistics Average,Maximum
    ```
  </TabPanel>
  <TabPanel name="API Gateway Metrics">
    ```bash
    # Check API Gateway performance
    aws cloudwatch get-metric-statistics \
        --namespace AWS/ApiGateway \
        --metric-name Count \
        --dimensions Name=ApiName,Value=mycompany-api \
        --start-time 2024-01-01T00:00:00Z \
        --end-time 2024-01-02T00:00:00Z \
        --period 3600 \
        --statistics Sum
    ```
  </TabPanel>
</Tabs>

## Getting Help

### Before Asking for Help

1. **Check this troubleshooting guide** for your specific issue
2. **Search existing issues** on the [GitHub repository](https://github.com/rithum/pika)
3. **Check the documentation** for your specific use case
4. **Try the solutions above** for common issues

### When Creating an Issue

:::tip[Issue Report Template]
Provide the following information for the best help:
:::

**Environment details:**

- Operating system and version
- Node.js version
- pnpm version
- Pika CLI version

**Error details:**

- Exact error message
- Steps to reproduce
- Expected vs actual behavior

**Debug information:**

- Console output with `--debug` flag
- Relevant log files
- Configuration files (without sensitive data)

**What you've tried:**

- Solutions attempted
- Workarounds that work/don't work

### Community Resources

- **GitHub Issues**: [https://github.com/rithum/pika/issues](https://github.com/rithum/pika/issues)
- **GitHub Discussions**: [https://github.com/rithum/pika/discussions](https://github.com/rithum/pika/discussions)
- **Documentation**: [https://github.com/rithum/pika](https://github.com/rithum/pika)

---

**Still having issues?** Create a detailed issue on GitHub with all the information above, and the community will help you resolve it!
