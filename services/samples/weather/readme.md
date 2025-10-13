# Weather Service

A weather service that provides both AWS Lambda functions and a Svelte web component.

## Project Structure

```
weather/
├── src/
│   ├── lambda/          # Lambda function code
│   │   └── weather/     # Weather service lambda
│   └── webcomponent/    # Svelte web component
│       ├── main.ts
│       ├── app.css
│       └── lib/         # Component library
├── lib/                 # CDK stack definitions
├── bin/                 # CDK entry points
├── test/               # Lambda tests
├── build/              # Webcomponent build output
└── dist/               # Lambda build output
```

## Development

### Lambda Functions

```bash
# Build Lambda functions
pnpm run build:lambda

# Watch for changes
pnpm run watch:lambda

# Run tests
pnpm test

# Type check
pnpm run check-types:lambda
```

### Web Component

```bash
# Start development server
pnpm run dev:webcomponent

# Build for production
pnpm run build:webcomponent

# Preview production build
pnpm run preview:webcomponent

# Type check
pnpm run check-types:webcomponent
```

### Building Everything

```bash
# Build both Lambda and webcomponent
pnpm run build

# Type check everything
pnpm run check-types
```

## CDK Deployment

```bash
# Synthesize CloudFormation template
pnpm run cdk:synth

# Deploy to AWS
pnpm run cdk:deploy

# View differences
pnpm run cdk:diff
```

## Technology Stack

### Infrastructure
- **AWS CDK**: Infrastructure as code
- **AWS Lambda**: Serverless functions
- **TypeScript**: Type-safe development

### Web Component
- **Svelte 5**: Modern reactive framework
- **Pika UX**: Component library
- **Tailwind CSS v4**: Utility-first styling
- **Vite**: Fast build tool and dev server

## Configuration

The project uses multiple TypeScript configurations:

- `tsconfig.json` - Base configuration
- `tsconfig.cdk.json` - CDK and Lambda compilation
- `tsconfig.webcomponent.json` - Webcomponent project references
- `tsconfig.app.json` - Svelte app compilation
- `tsconfig.node.json` - Vite config compilation
