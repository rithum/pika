# Cookie Encryption Setup Tool

## Purpose

When developing locally, you might not want to deploy the full CloudFormation stack (which includes ECS, load balancers, etc.), but you still need the cookie encryption infrastructure. This tool lets you create just the encryption infrastructure independently.

### Extra detail if you want it

You only need to run this if you don't want to deploy the front end stack to AWS and want to run locally. The default
auth for the front end stack (apps/pika-chat) is an insecure mock auth provider and doesn't have a real dns entry
so if you first create your own version of pika use `pika create-app` and you want to kick the tires before customizing it,
you would first deploy the back end stack (`services/pika`) and then you'd run this tool to create the front end infra
that would have been created on deploy of the front end stack. On front end stack deploy, a custom cloudformation
resource invokes the methods this tool. This tool and the cloudformation custom resource are idempotent in
creating and initializing key rotation infrastructure.

## What It Creates

- **KMS Key**: AES-256 encryption key for cookie encryption
- **KMS Alias**: Named alias for easy key reference
- **SSM Parameters**:
    - Key version tracking
    - Encrypted data encryption keys
    - Rotation timestamps
    - Key alias reference

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 22+
- pnpm package manager

## Usage

### Check Infrastructure Status

```bash
pnpm run encryption:setup -- status
```

This shows you the current state of your cookie encryption infrastructure.

### Create Infrastructure

```bash
pnpm run encryption:setup -- setup
```

Creates all required infrastructure if it doesn't exist. Safe to run multiple times (idempotent).

### Different Stages

```bash
STAGE=test pnpm run encryption:setup -- setup
STAGE=prod pnpm run encryption:setup -- setup
```

### Cleanup Infrastructure

```bash
pnpm run encryption:setup -- cleanup --force
```

**Warning**: This deletes all infrastructure! Use with caution.

### Help

```bash
pnpm run encryption:setup -- help
```

## Environment Variables

- `STAGE`: Deployment stage (default: `test`)
- `AWS_REGION`: AWS region (default: `us-east-1`)
- `AWS_DEFAULT_REGION`: Alternative AWS region setting

## IAM Permissions Required

Your AWS credentials need the following permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "kms:CreateKey",
                "kms:CreateAlias",
                "kms:DescribeKey",
                "kms:ListAliases",
                "kms:TagResource",
                "kms:GenerateDataKey",
                "kms:Decrypt",
                "kms:DeleteAlias",
                "kms:ScheduleKeyDeletion"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath", "ssm:PutParameter", "ssm:DeleteParameter"],
            "Resource": "arn:aws:ssm:*:*:parameter/stack/*"
        },
        {
            "Effect": "Allow",
            "Action": ["sts:GetCallerIdentity"],
            "Resource": "*"
        }
    ]
}
```

## Integration with CloudFormation

This tool creates the same resources as the CloudFormation custom resource. You can:

1. Use this tool for local development
2. Deploy the full CloudFormation stack for production
3. Switch between them without conflicts

The infrastructure is identical, so your application will work the same way in both scenarios.

## Troubleshooting

### AWS Credentials Not Found

```bash
aws configure
# OR
export AWS_PROFILE=your-profile
```

### Permission Denied

Make sure your AWS user/role has the required IAM permissions listed above.

### Infrastructure Already Exists

The tool is idempotent - it won't recreate existing infrastructure. Use `--status` to check what exists.

### KMS Key Deletion

When you use `--cleanup`, KMS keys are scheduled for deletion (minimum 7 days). This is an AWS security requirement and cannot be bypassed.

## Development

The tool uses shared infrastructure management code located in:

- `src/lib/server/encryption/InfrastructureManager.ts`
- `src/lib/server/encryption/KeyRotationUtils.ts`

This ensures consistency between the tool and the CloudFormation custom resource.
