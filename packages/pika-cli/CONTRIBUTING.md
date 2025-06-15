# Contributing to Pika CLI

Thank you for your interest in contributing to Pika CLI! This document provides guidelines and information for contributors.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)

## 📜 Code of Conduct

This project follows the Pika Framework Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## 🚀 Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- pnpm (recommended) or npm
- Git
- Basic knowledge of TypeScript and CLI development

### First-time Setup

1. **Fork the repository**

    ```bash
    # Fork the repo on GitHub, then clone your fork
    git clone https://github.com/YOUR_USERNAME/pika-framework.git
    cd pika-framework/packages/pika-cli
    ```

2. **Install dependencies**

    ```bash
    pnpm install
    ```

3. **Build the project**

    ```bash
    pnpm build
    ```

4. **Link for local testing**

    ```bash
    npm link
    ```

5. **Verify installation**
    ```bash
    pika --help
    ```

## 🔧 Development Setup

### Package Structure

```
packages/pika-cli/
├── src/
│   ├── commands/          # CLI command implementations
│   ├── utils/             # Utility functions and classes
│   ├── __tests__/         # Test files
│   └── index.ts           # CLI entry point
├── templates/             # Project templates
├── scripts/               # Build and utility scripts
├── dist/                  # Compiled output (ignored in git)
└── README.md
```

### Available Scripts

```bash
# Development
pnpm dev              # Watch mode for development
pnpm build            # Build for production
pnpm clean            # Clean build artifacts

# Testing
pnpm test             # Run all tests
pnpm test:watch       # Run tests in watch mode
pnpm test:coverage    # Run tests with coverage

# Code Quality
pnpm lint             # Run ESLint
pnpm lint:fix         # Fix ESLint issues
pnpm type-check       # TypeScript type checking

# Release
pnpm prepublishOnly   # Prepare for publishing
```

## 🏗 Project Structure

### Commands (`src/commands/`)

Each CLI command has its own file:

- `create-app.ts` - Project creation logic
- `sync.ts` - Framework synchronization
- `component.ts` - Component management
- `auth.ts` - Authentication configuration

### Utilities (`src/utils/`)

Shared utilities:

- `logger.ts` - Logging and output formatting
- `file-manager.ts` - File system operations
- `git-manager.ts` - Git repository operations
- `config-manager.ts` - Configuration management
- `system-checker.ts` - Environment validation
- `template-manager.ts` - Template processing

### Templates (`templates/`)

Project templates for different use cases:

- `default/` - Standard Pika application
- `minimal/` - Minimal setup
- `enterprise/` - Enterprise features

## 🔄 Development Workflow

### Feature Development

1. **Create a feature branch**

    ```bash
    git checkout -b feature/your-feature-name
    ```

2. **Make your changes**

    - Write code following our style guide
    - Add tests for new functionality
    - Update documentation as needed

3. **Test your changes**

    ```bash
    pnpm test
    pnpm lint
    pnpm build
    ```

4. **Test the CLI locally**

    ```bash
    # Link your development version
    npm link

    # Test commands
    pika create-app test-app
    cd test-app
    pika --help
    ```

### Bug Fixes

1. **Create a bugfix branch**

    ```bash
    git checkout -b fix/bug-description
    ```

2. **Write a failing test** (if applicable)
3. **Fix the bug**
4. **Ensure tests pass**
5. **Submit a pull request**

## 🧪 Testing

### Test Structure

We use Jest for testing with the following patterns:

```typescript
// Unit test example
describe('UtilityFunction', () => {
    it('should handle valid input', () => {
        expect(utilityFunction('valid')).toBe('expected');
    });

    it('should throw on invalid input', () => {
        expect(() => utilityFunction('invalid')).toThrow();
    });
});

// Integration test example
describe('CreateAppCommand', () => {
    it('should create a project with default settings', async () => {
        // Test the full command flow
    });
});
```

### Test Categories

1. **Unit Tests** - Test individual functions and classes
2. **Integration Tests** - Test command flows and interactions
3. **E2E Tests** - Test the complete CLI experience

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test logger.test.ts

# Run tests with coverage
pnpm test:coverage

# Watch mode for development
pnpm test:watch
```

### Test Guidelines

- Write tests for all new functionality
- Maintain or improve code coverage
- Use descriptive test names
- Mock external dependencies
- Test both success and error cases

## 🎨 Code Style

We use ESLint and Prettier for consistent code formatting.

### Style Guidelines

- Use TypeScript for all code (including build scripts)
- Prefer `const` over `let` when possible
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused
- Use async/await over Promises
- Use proper TypeScript imports/exports (ESM style)

### Example Code Style

```typescript
/**
 * Creates a new Pika project with the specified configuration.
 *
 * @param projectName - Name of the project to create
 * @param options - Configuration options for the project
 * @returns Promise that resolves when the project is created
 */
export async function createProject(projectName: string, options: CreateProjectOptions): Promise<void> {
    const spinner = logger.startSpinner('Creating project...');

    try {
        await validateProjectName(projectName);
        await setupProjectStructure(projectName, options);
        await installDependencies(projectName);

        logger.stopSpinner(true, 'Project created successfully');
    } catch (error) {
        logger.stopSpinner(false, 'Failed to create project');
        throw error;
    }
}
```

### Linting

```bash
# Check code style
pnpm lint

# Fix issues automatically
pnpm lint:fix
```

## 📝 Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/) for consistent commit messages.

### Commit Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring
- `test` - Adding or modifying tests
- `chore` - Maintenance tasks

### Examples

```bash
feat: add component validation command
fix: resolve sync conflict with custom auth
docs: update README with new examples
test: add integration tests for create-app
chore: update dependencies
```

## 🔃 Pull Request Process

### Before Submitting

1. **Ensure all tests pass**

    ```bash
    pnpm test
    pnpm lint
    pnpm build
    ```

2. **Update documentation** if needed
3. **Add changeset entry** for significant changes
4. **Test manually** with various scenarios

### PR Description Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix (non-breaking change)
- [ ] New feature (non-breaking change)
- [ ] Breaking change (fix or feature causing existing functionality to change)
- [ ] Documentation update

## Testing

- [ ] Tests pass locally
- [ ] Added tests for new functionality
- [ ] Manual testing completed

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings or errors
```

### Review Process

1. **Automated checks** must pass
2. **Code review** by maintainers
3. **Manual testing** may be required
4. **Address feedback** and update PR
5. **Final approval** and merge

## 🚀 Release Process

### Version Management

We use semantic versioning (semver):

- **Major** (X.0.0) - Breaking changes
- **Minor** (0.X.0) - New features, backward compatible
- **Patch** (0.0.X) - Bug fixes, backward compatible

### Release Steps

1. **Update CHANGELOG.md**
2. **Update package.json version**
3. **Create release PR**
4. **Tag release after merge**
5. **Publish to npm**
6. **Create GitHub release**

### Beta Releases

For testing major changes:

```bash
# Beta version
npm version prerelease --preid=beta
npm publish --tag beta
```

## 🤝 Community Guidelines

### Getting Help

- Check existing documentation
- Search existing issues
- Ask questions in discussions
- Join our Discord community

### Reporting Issues

When reporting bugs:

1. Use the issue template
2. Provide minimal reproduction steps
3. Include environment information
4. Add relevant logs or screenshots

### Suggesting Features

When suggesting new features:

1. Check if it already exists
2. Describe the use case
3. Explain the expected behavior
4. Consider implementation complexity

## 🎯 Areas for Contribution

We welcome contributions in these areas:

### High Priority

- **New Authentication Providers** - Add support for more auth systems
- **Template Improvements** - Enhance existing templates or add new ones
- **Documentation** - Improve guides and examples
- **Testing** - Increase test coverage
- **Performance** - Optimize CLI performance

### Medium Priority

- **Error Handling** - Improve error messages and recovery
- **Logging** - Enhanced debug and logging capabilities
- **Configuration** - More configuration options
- **Migration Scripts** - Tools for framework updates

### Ideas Welcome

- **Plugin System** - Allow third-party extensions
- **GUI Interface** - Web-based project setup
- **Docker Integration** - Container-based development
- **CI/CD Templates** - Deployment automation

## 📞 Contact

- **Issues**: [GitHub Issues](https://github.com/pika-framework/pika/issues)
- **Discussions**: [GitHub Discussions](https://github.com/pika-framework/pika/discussions)
- **Discord**: [Pika Community](https://discord.gg/pika-framework)
- **Email**: [maintainers@pika-framework.dev](mailto:maintainers@pika-framework.dev)

## 🙏 Recognition

Contributors will be recognized in:

- README acknowledgments
- Release notes
- GitHub contributors page
- Community highlights

Thank you for contributing to Pika CLI! 🐦✨
