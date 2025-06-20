# Troubleshooting Guide

This guide helps you resolve common issues you might encounter when using Pika Framework.

## 🚨 Quick Diagnosis

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

## 🔧 Installation Issues

### Node.js Version Problems

**Error**: `Node.js version 22.0.0 or higher is required`

**Solution**:

```bash
# Check current version
node --version

# Update Node.js
# macOS with Homebrew:
brew upgrade node

# Linux with NodeSource:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows: Download from nodejs.org
```

### pnpm Installation Issues

**Error**: `pnpm: command not found`

**Solution**:

```bash
# Install pnpm globally
npm install -g pnpm

# Or use the official installer
curl -fsSL https://get.pnpm.io/install.sh | sh -

# Verify installation
pnpm --version
```

## 🏗️ Build Issues

### TypeScript Compilation Errors

**Error**: `TypeScript compilation failed`

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

**Error**: `Cannot find module 'xyz'`

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

**Error**: `Build script failed with exit code 1`

**Solution**:

```bash
# Check build logs for specific errors
pnpm build --verbose

# Try building individual packages
cd apps/pika-chat && pnpm build
cd services/pika && pnpm build

# Check for environment-specific issues
echo $NODE_ENV
```

## 🚀 Deployment Issues

### AWS Credentials Not Configured

**Error**: `Unable to locate credentials`

**Solution**:

```bash
# Configure AWS CLI
aws configure

# Or set environment variables
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_DEFAULT_REGION=us-east-1

# Verify credentials
aws sts get-caller-identity
```

### CDK Bootstrap Required

**Error**: `This stack uses assets, so the toolkit stack must be deployed to the environment`

**Solution**:

```bash
# Bootstrap CDK in your account/region
cdk bootstrap

# Verify bootstrap
aws cloudformation describe-stacks --stack-name CDKToolkit
```

### Insufficient IAM Permissions

**Error**: `User is not authorized to perform: cloudformation:CreateStack`

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

**Error**: `Certificate not found` or `Hosted zone not found`

**Solution**:

```bash
# Verify certificate exists
aws acm list-certificates --region us-east-1

# Verify hosted zone exists
aws route53 list-hosted-zones

# Check certificate ARN format
# Should be: arn:aws:acm:region:account:certificate/cert-id
```

### VPC Configuration Issues

**Error**: `VPC not found` or `Subnet not found`

**Solution**:

```bash
# List VPCs
aws ec2 describe-vpcs

# List subnets
aws ec2 describe-subnets

# Verify subnet tags
aws ec2 describe-subnets --subnet-ids subnet-12345678
```

## 🔄 Runtime Issues

### Frontend Not Loading

**Symptoms**: Blank page, console errors, 404 errors

**Solution**:

```bash
# Check if development server is running
lsof -i :3000

# Check for build errors
cd apps/pika-chat && pnpm build

# Check environment variables
cat .env.local

# Check browser console for JavaScript errors
```

### Backend Services Not Responding

**Symptoms**: Chat doesn't work, API errors, 500 responses

**Solution**:

```bash
# Check if services are deployed
aws cloudformation describe-stacks --stack-name mycompany-pika

# Check Lambda function logs
aws logs tail /aws/lambda/mycompany-pika-service --follow

# Check API Gateway logs
aws logs tail /aws/apigateway/mycompany-api --follow
```

### Authentication Issues

**Symptoms**: Login fails, session errors, unauthorized access

**Solution**:

```bash
# Check authentication provider configuration
cat apps/pika-chat/src/lib/server/auth-provider/index.ts

# Check browser cookies and local storage
# Clear browser cache and cookies
```

## 🔄 Sync Issues

### Sync Command Fails

**Error**: `Failed to sync with framework`

**Solution**:

```bash
# Check internet connection
ping github.com

# Use debug mode for more information
pika sync --debug

# Check GitHub access
curl -I https://github.com/rithum/pika

# Try with different branch
pika sync --branch main
```

### Unexpected File Overwrites

**Symptoms**: Custom files were overwritten during sync

**Solution**:

```bash
# Check sync configuration
cat .pika-sync.json

# Add files to userProtectedAreas
# Edit .pika-sync.json and add:
"userProtectedAreas": ["my-custom-file.ts"]

# Restore from git if available
git checkout HEAD -- my-custom-file.ts
```

### Merge Conflicts

**Symptoms**: Sync stops due to conflicts

**Solution**:

```bash
# Review conflicts
pika sync --diff

# Resolve conflicts manually
# Edit conflicted files and remove conflict markers

# Or protect the file
# Add to userProtectedAreas in .pika-sync.json
```

## 🔍 Debugging Tools

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

```bash
# View recent logs
aws logs tail /aws/lambda/mycompany-pika-service --follow

# Search for errors
aws logs filter-log-events \
    --log-group-name /aws/lambda/mycompany-pika-service \
    --filter-pattern "ERROR"

# Export logs for analysis
aws logs export-task \
    --task-name "export-$(date +%s)" \
    --log-group-name /aws/lambda/mycompany-pika-service \
    --from 1640995200000 \
    --to 1641081600000 \
    --destination "mycompany-logs-bucket" \
    --destination-prefix "logs/"
```

### Performance Monitoring

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

## 🆘 Getting Help

### Before Asking for Help

1. **Check this troubleshooting guide** for your specific issue
2. **Search existing issues** on the [GitHub repository](https://github.com/rithum/pika)
3. **Check the documentation** for your specific use case
4. **Try the solutions above** for common issues

### When Creating an Issue

Provide the following information:

1. **Environment details**:

    - Operating system and version
    - Node.js version
    - pnpm version
    - Pika CLI version

2. **Error details**:

    - Exact error message
    - Steps to reproduce
    - Expected vs actual behavior

3. **Debug information**:

    - Console output with `--debug` flag
    - Relevant log files
    - Configuration files (without sensitive data)

4. **What you've tried**:
    - Solutions attempted
    - Workarounds that work/don't work

### Community Resources

- **GitHub Issues**: [https://github.com/rithum/pika/issues](https://github.com/rithum/pika/issues)
- **GitHub Discussions**: [https://github.com/rithum/pika/discussions](https://github.com/rithum/pika/discussions)
- **Documentation**: [https://github.com/rithum/pika](https://github.com/rithum/pika)

---

**Still having issues?** Create a detailed issue on GitHub with all the information above, and the community will help you resolve it!
