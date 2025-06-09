# Pika Webapp Knowledge Base

Welcome to the Pika WebApp Knowledge Base. This documentation is designed to help both human developers and AI assistants understand the application architecture, patterns, and best practices.

## Documentation Structure

### 1. Getting Started

- [Application Architecture](./1-getting-started/1.1-application-architecture.md) - Overview of the webapp's structure
- [Development Setup](./1-getting-started/1.2-development-setup.md) - Setting up your development environment
- [Application Lifecycle](./1-getting-started/1.3-application-lifecycle.md) - How the application initializes and runs

### 2. Core Concepts

- [Svelte 5 Essentials](./2-core-concepts/2.1-svelte5-essentials.md) - Key Svelte 5 patterns and syntax
- [State Management](./2-core-concepts/2.2-state-management.md) - How state is managed throughout the application
- [Component Types](./2-core-concepts/2.3-component-types.md) - Different component types and their purposes

### 3. Implementation

- [Feature Development Workflow](./3-implementation/3.1-feature-dev-workflow.md) - Step-by-step guide to creating new features
- [AI Implementation Strategies](./3-implementation/3.2-ai-impl-strategies.md) - Implementation guide for AI to follow project patterns/practices

## How to Use This Documentation

1. **New to the Project**: Start with the Getting Started section to understand the basics
2. **Understanding Core Concepts**: Explore the Core Concepts section for detailed explanations
3. **Implementing Features**: Follow the Feature Development Workflow for step-by-step guidance
4. **Specific Patterns**: Refer to the legacy documentation as needed

## Important Patterns

The Pika webapp follows these key patterns:

1. **Centralized State Management**: All application state is managed through the AppState
2. **Component Organization**: Components are organized by type (app, features, server, client, ui, ui-pika)
3. **Feature Isolation**: Features are self-contained with their own state and components
4. **Reactive UI**: The UI automatically updates in response to state changes
5. **Lifecycle Management**: Components follow consistent patterns for initialization and cleanup

## For AI Assistants

When implementing new features or modifying existing code, AI assistants should:

1. **Understand the Application Lifecycle**: Review the Application Lifecycle documentation to understand how components initialize and interact
2. **Follow State Management Patterns**: Use the established state management approach with AppState as the central hub
3. **Use Appropriate Component Types**: Choose the correct component type (UI, UI-Pika, Client, Server, Feature, App) based on the component's purpose
4. **Adhere to Svelte 5 Syntax**: Always use Svelte 5 patterns and avoid Svelte 4 syntax
5. **Use Proper Effects**: Implement effects correctly with explicit dependencies and cleanup functions
6. **Maintain Feature Isolation**: Keep features isolated and avoid cross-feature dependencies
7. **Follow the Feature Development Workflow**: Use the step-by-step guide for consistent implementation

## Quick Reference

- **State Access Pattern**: `const appState = getContext<AppState>('appState');`
- **Feature State Access**: `const featureState = appState.featureName;`
- **Component Props**: `let { prop1, prop2 } = $props<{ prop1: Type, prop2?: Type }>();`
- **Effects**: `$effect(() => { /* setup */ return () => { /* cleanup */ }; });`
- **Component Context**: Use `setContext`/`getContext` for component-specific context

This knowledge base is designed to be a comprehensive guide to the pika webapp. If you find any gaps or have questions, please contribute by expanding the documentation.
