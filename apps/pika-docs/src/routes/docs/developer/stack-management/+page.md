# Stack Management

Guidance for managing your Pika infrastructure and deployments.

## Infrastructure Overview

Pika uses AWS CDK for infrastructure as code, providing:

- **Automated Deployment** - CDK handles resource provisioning
- **Type Safety** - TypeScript-based infrastructure definitions
- **Version Control** - Infrastructure code lives in your repository
- **Rollback Support** - CDK tracks stack state

## Key Topics

### Deployment

- [AWS Deployment](/docs/developer/aws-deployment) - Deploy your Pika application to AWS
- [Local Development](/docs/developer/local-development) - Run Pika locally

### Updates & Migrations

- [Sync System](/docs/developer/sync-system) - Keep framework updated
- [Migration Guides](/docs/releases/migration-guides) - Upgrade through breaking changes
- [Releases](/docs/releases/overview) - Version history and updates

### Configuration

- [Project Structure](/docs/developer/project-structure) - Understanding your project layout
- [Customization](/docs/developer/customization) - Customize Pika for your needs

## Common Stack Management Tasks

### Check Stack Status

```bash
cd services/pika
pnpm cdk:diff    # See what would change
pnpm cdk:deploy  # Deploy changes
```

### Update Framework

```bash
# From project root
pika sync --dry-run  # Preview updates
pika sync            # Apply updates
```

### Rollback Deployment

```bash
cd services/pika
# CDK doesn't have built-in rollback, use git history:
git log              # Find previous working commit
git checkout <hash>  # Checkout previous version
pnpm cdk:deploy     # Redeploy old version
```

## Breaking Changes

When breaking changes affect infrastructure:

1. **Read Migration Guide** - [Migration Guides](/docs/releases/migration-guides)
2. **Follow Steps Carefully** - Infrastructure changes can't always be undone easily
3. **Test in Non-Production First** - If possible, test in dev environment
4. **Backup Critical Data** - Especially DynamoDB tables

## Best Practices

- **Version Control Everything** - Commit infrastructure changes
- **Document Custom Changes** - Note deviations from framework defaults
- **Test Deployments** - Use `cdk:diff` before deploying
- **Monitor Deployments** - Watch CloudFormation events in AWS Console
- **Keep Framework Updated** - Regular `pika sync` keeps you current

## Learn More

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Pika Releases](/docs/releases/overview)
- [Troubleshooting](/docs/developer/troubleshooting)
