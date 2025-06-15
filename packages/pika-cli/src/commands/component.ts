import inquirer from 'inquirer';
import path from 'path';
import { configManager } from '../utils/config-manager.js';
import { fileManager } from '../utils/file-manager.js';
import { logger } from '../utils/logger.js';
import type { DistinctQuestion } from 'inquirer';

interface ComponentOptions {
    add?: string;
    list?: boolean;
    validate?: boolean;
}

interface ComponentDefinition {
    name: string;
    filePath: string;
    props: Array<{
        name: string;
        type: string;
        required: boolean;
        default?: any;
    }>;
    description?: string;
}

interface ComponentDetails {
    description: string;
    addProps: boolean;
    props?: Array<{
        name: string;
        type: string;
        required: boolean;
        defaultValue?: any;
    }>;
}

export async function componentCommand(options: ComponentOptions = {}): Promise<void> {
    try {
        logger.header('🎨 Pika Custom Components Manager');

        // Verify this is a Pika project
        if (!(await configManager.isPikaProject())) {
            logger.error('This is not a Pika project. Run this command from a Pika project directory.');
            return;
        }

        // Load configuration
        const config = await configManager.loadConfig();
        if (!config) {
            logger.error('Failed to load project configuration.');
            return;
        }

        // Handle different command options
        if (options.add) {
            await addComponent(options.add, config);
        } else if (options.list) {
            await listComponents(config);
        } else if (options.validate) {
            await validateComponents(config);
        } else {
            // Interactive mode
            await interactiveComponentManager(config);
        }
    } catch (error) {
        logger.error('Component command failed:', error);
        process.exit(1);
    }
}

async function interactiveComponentManager(config: any): Promise<void> {
    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                { name: 'Add a new component', value: 'add' },
                { name: 'List all components', value: 'list' },
                { name: 'Validate components', value: 'validate' },
                { name: 'Generate component documentation', value: 'docs' }
            ]
        }
    ]);

    switch (action) {
        case 'add':
            const { componentName } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'componentName',
                    message: 'Component name (kebab-case):',
                    validate: (input: string) => {
                        if (!input.trim()) return 'Component name is required';
                        if (!/^[a-z][a-z0-9-]*$/.test(input)) return 'Component name must be kebab-case (lowercase, hyphens allowed)';
                        return true;
                    }
                }
            ]);
            await addComponent(componentName, config);
            break;

        case 'list':
            await listComponents(config);
            break;

        case 'validate':
            await validateComponents(config);
            break;

        case 'docs':
            await generateComponentDocs(config);
            break;
    }
}

async function addComponent(componentName: string, config: any): Promise<void> {
    logger.info(`Creating component: ${componentName}`);

    const customComponentsDir = fileManager.resolvePath(config.components.customDirectory);

    // Ensure the custom components directory exists
    if (!(await fileManager.exists(customComponentsDir))) {
        await fileManager.createDirectory(customComponentsDir);
        logger.info(`Created custom components directory: ${config.components.customDirectory}`);
    }

    // Check if component already exists
    const componentPath = path.join(customComponentsDir, `${componentName}.svelte`);
    if (await fileManager.exists(componentPath)) {
        const { overwrite } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'overwrite',
                message: `Component "${componentName}" already exists. Overwrite?`,
                default: false
            }
        ]);

        if (!overwrite) {
            logger.info('Component creation cancelled.');
            return;
        }
    }

    // Get component details
    const componentDetails = await getComponentDetails(componentName);

    // Generate component file
    await generateComponentFile(componentPath, componentName, componentDetails);

    // Update component registry
    await updateComponentRegistry(customComponentsDir, componentName);

    logger.success(`Component "${componentName}" created successfully!`);
    logger.info(`Component file: ${componentPath}`);
    logger.info(`Usage in chat: <${componentName}${generateUsageExample(componentDetails)}>`);
}

async function getComponentDetails(componentName: string): Promise<ComponentDetails> {
    const questions: Array<DistinctQuestion<ComponentDetails>> = [
        {
            type: 'input',
            name: 'description',
            message: 'Component description:',
            default: `A custom ${componentName} component for Pika chat`
        },
        {
            type: 'confirm',
            name: 'addProps',
            message: 'Add custom props?',
            default: true
        }
    ];

    const answers = await inquirer.prompt<ComponentDetails>(questions);

    if (answers.addProps) {
        answers.props = await getComponentProps();
    } else {
        answers.props = [];
    }

    return answers;
}

async function getComponentProps(): Promise<Array<any>> {
    const props: Array<any> = [];
    let addMore = true;

    while (addMore) {
        const propDetails = await inquirer.prompt([
            {
                type: 'input',
                name: 'name',
                message: 'Prop name:',
                validate: (input: string) => {
                    if (!input.trim()) return 'Prop name is required';
                    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input)) return 'Invalid prop name';
                    return true;
                }
            },
            {
                type: 'list',
                name: 'type',
                message: 'Prop type:',
                choices: ['string', 'number', 'boolean', 'object', 'array']
            },
            {
                type: 'confirm',
                name: 'required',
                message: 'Is this prop required?',
                default: false
            },
            {
                type: 'input',
                name: 'defaultValue',
                message: 'Default value (optional):',
                when: (answers) => !answers.required
            }
        ]);

        props.push(propDetails);

        const { continueAdding } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'continueAdding',
                message: 'Add another prop?',
                default: false
            }
        ]);

        addMore = continueAdding;
    }

    return props;
}

async function generateComponentFile(componentPath: string, componentName: string, details: any): Promise<void> {
    const { description, props = [] } = details;

    // Generate script section with props
    const propsDeclarations = props
        .map((prop: any) => {
            const typeAnnotation = `: ${prop.type}`;
            const defaultValue = prop.defaultValue ? ` = ${JSON.stringify(prop.defaultValue)}` : prop.required ? '' : getDefaultValueForType(prop.type);
            return `  export let ${prop.name}${typeAnnotation}${defaultValue};`;
        })
        .join('\n');

    // Generate component template
    const componentContent = `<script lang="ts">
  // ${description}
${propsDeclarations}
</script>

<div class="${componentName}-component">
  <div class="component-header">
    <h3>${componentName.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</h3>
  </div>
  
  <div class="component-content">
    ${generateContentTemplate(props)}
  </div>
</div>

<style>
  .${componentName}-component {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 16px;
    margin: 8px 0;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
  
  .component-header {
    margin-bottom: 12px;
  }
  
  .component-header h3 {
    margin: 0;
    color: #2d3748;
    font-size: 1.1em;
    font-weight: 600;
  }
  
  .component-content {
    color: #4a5568;
  }
  
  /* Add your custom styles here */
</style>
`;

    await fileManager.writeFile(componentPath, componentContent);
}

function getDefaultValueForType(type: string): string {
    switch (type) {
        case 'string':
            return " = ''";
        case 'number':
            return ' = 0';
        case 'boolean':
            return ' = false';
        case 'array':
            return ' = []';
        case 'object':
            return ' = {}';
        default:
            return '';
    }
}

function generateContentTemplate(props: Array<any>): string {
    if (props.length === 0) {
        return `<p>This is a custom ${props.length} component. Add your content here.</p>`;
    }

    return props
        .map((prop) => {
            switch (prop.type) {
                case 'string':
                    return `    <p><strong>${prop.name}:</strong> {${prop.name}}</p>`;
                case 'number':
                    return `    <p><strong>${prop.name}:</strong> {${prop.name}}</p>`;
                case 'boolean':
                    return `    {#if ${prop.name}}<p>✓ ${prop.name} is true</p>{/if}`;
                case 'array':
                    return `    {#each ${prop.name} as item}<p>• {item}</p>{/each}`;
                case 'object':
                    return `    <pre>{JSON.stringify(${prop.name}, null, 2)}</pre>`;
                default:
                    return `    <p>{${prop.name}}</p>`;
            }
        })
        .join('\n');
}

function generateUsageExample(details: any): string {
    const { props = [] } = details;

    if (props.length === 0) {
        return '>';
    }

    const exampleProps = props
        .map((prop: any) => {
            const exampleValue = getExampleValue(prop.type);
            return `${prop.name}="${exampleValue}"`;
        })
        .join(' ');

    return ` ${exampleProps}>`;
}

function getExampleValue(type: string): string {
    switch (type) {
        case 'string':
            return 'example text';
        case 'number':
            return '42';
        case 'boolean':
            return 'true';
        case 'array':
            return '["item1", "item2"]';
        case 'object':
            return '{"key": "value"}';
        default:
            return 'value';
    }
}

async function updateComponentRegistry(customComponentsDir: string, componentName: string): Promise<void> {
    const indexPath = path.join(customComponentsDir, 'index.ts');

    let registryContent = '';

    if (await fileManager.exists(indexPath)) {
        registryContent = await fileManager.readFile(indexPath);
    } else {
        registryContent = `// Custom Markdown Tag Components Registry
// This file is automatically updated when you add components

export interface CustomComponentMap {
  // Component interfaces are defined here
}

// Export your custom components here
export const customComponents = {
  // Components are registered here
};

export default customComponents;
`;
    }

    // Add import for new component
    const importStatement = `import ${componentName.replace(/-/g, '')}Component from './${componentName}.svelte';`;

    // Add to component map
    const componentMapEntry = `  '${componentName}': ${componentName.replace(/-/g, '')}Component,`;

    // Update the file content
    if (!registryContent.includes(importStatement)) {
        // Add import after the existing imports or at the top
        const lines = registryContent.split('\n');
        const importIndex = lines.findIndex((line) => line.startsWith('import')) + 1 || 2;
        lines.splice(importIndex, 0, importStatement);
        registryContent = lines.join('\n');
    }

    // Add to components object
    if (!registryContent.includes(componentMapEntry)) {
        registryContent = registryContent.replace(/export const customComponents = \{([^}]*)\}/, `export const customComponents = {$1\n${componentMapEntry}\n}`);
    }

    await fileManager.writeFile(indexPath, registryContent);
}

async function listComponents(config: any): Promise<void> {
    const customComponentsDir = fileManager.resolvePath(config.components.customDirectory);

    if (!(await fileManager.exists(customComponentsDir))) {
        logger.warn('Custom components directory does not exist.');
        logger.info(`Expected location: ${config.components.customDirectory}`);
        return;
    }

    // Find all .svelte files in the custom components directory
    const componentFiles = await fileManager.findFiles('*.svelte', customComponentsDir);

    if (componentFiles.length === 0) {
        logger.info('No custom components found.');
        logger.info('Use "pika component add <name>" to create your first component.');
        return;
    }

    logger.info(`Found ${componentFiles.length} custom component(s):`);
    logger.newLine();

    for (const componentFile of componentFiles) {
        const componentName = fileManager.basename(componentFile).replace(/\.svelte$/, '');
        const componentPath = path.join(customComponentsDir, componentFile);

        // Try to extract component information
        const componentInfo = await analyzeComponent(componentPath);

        console.log(`📦 ${componentName}`);
        console.log(`   File: ${componentFile}`);
        if (componentInfo.description) {
            console.log(`   Description: ${componentInfo.description}`);
        }
        if (componentInfo.props.length > 0) {
            console.log(`   Props: ${componentInfo.props.map((p) => p.name).join(', ')}`);
        }
        console.log(`   Usage: <${componentName}${generateUsageExample({ props: componentInfo.props })}>`);
        logger.newLine();
    }

    // Check registry status
    const indexPath = path.join(customComponentsDir, 'index.ts');
    if (await fileManager.exists(indexPath)) {
        logger.success('Component registry is up to date.');
    } else {
        logger.warn('Component registry (index.ts) not found. Run "pika component validate" to fix.');
    }
}

async function analyzeComponent(componentPath: string): Promise<ComponentDefinition> {
    const content = await fileManager.readFile(componentPath);
    const props: Array<any> = [];
    let description = '';

    // Extract props from script section
    const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (scriptMatch) {
        const scriptContent = scriptMatch[1];

        // Extract description from comments
        const descriptionMatch = scriptContent.match(/\/\/\s*(.+)/);
        if (descriptionMatch) {
            description = descriptionMatch[1];
        }

        // Extract export let statements (props)
        const propMatches = scriptContent.matchAll(/export\s+let\s+(\w+)(?:\s*:\s*(\w+))?(?:\s*=\s*([^;]+))?/g);
        for (const match of propMatches) {
            props.push({
                name: match[1],
                type: match[2] || 'any',
                required: !match[3],
                default: match[3]
            });
        }
    }

    return {
        name: fileManager.basename(componentPath).replace(/\.svelte$/, ''),
        filePath: componentPath,
        props,
        description
    };
}

async function validateComponents(config: any): Promise<void> {
    logger.info('Validating custom components...');

    const customComponentsDir = fileManager.resolvePath(config.components.customDirectory);

    if (!(await fileManager.exists(customComponentsDir))) {
        logger.error(`Custom components directory not found: ${config.components.customDirectory}`);
        return;
    }

    const issues: string[] = [];
    const warnings: string[] = [];

    // Check for component files
    const componentFiles = await fileManager.findFiles('*.svelte', customComponentsDir);

    if (componentFiles.length === 0) {
        warnings.push('No custom components found');
    }

    // Validate each component
    for (const componentFile of componentFiles) {
        const componentPath = path.join(customComponentsDir, componentFile);
        const componentInfo = await analyzeComponent(componentPath);

        // Check component syntax
        const content = await fileManager.readFile(componentPath);

        if (!content.includes('<script')) {
            issues.push(`${componentFile}: Missing <script> section`);
        }

        if (!content.includes('<style')) {
            warnings.push(`${componentFile}: No <style> section found`);
        }

        // Validate prop types
        for (const prop of componentInfo.props) {
            if (!['string', 'number', 'boolean', 'object', 'array', 'any'].includes(prop.type)) {
                issues.push(`${componentFile}: Invalid prop type "${prop.type}" for prop "${prop.name}"`);
            }
        }
    }

    // Check registry file
    const indexPath = path.join(customComponentsDir, 'index.ts');
    if (!(await fileManager.exists(indexPath))) {
        issues.push('Component registry (index.ts) not found');
    } else {
        // Validate registry content
        const registryContent = await fileManager.readFile(indexPath);

        for (const componentFile of componentFiles) {
            const componentName = fileManager.basename(componentFile).replace(/\.svelte$/, '');
            const importName = componentName.replace(/-/g, '');

            if (!registryContent.includes(`import ${importName}Component`)) {
                issues.push(`${componentFile}: Not imported in registry`);
            }

            if (!registryContent.includes(`'${componentName}':`)) {
                issues.push(`${componentFile}: Not registered in component map`);
            }
        }
    }

    // Show results
    logger.newLine();

    if (issues.length === 0 && warnings.length === 0) {
        logger.success('All components are valid! 🎉');
    } else {
        if (issues.length > 0) {
            logger.error(`Found ${issues.length} issue(s):`);
            issues.forEach((issue) => console.log(`  ✗ ${issue}`));
        }

        if (warnings.length > 0) {
            logger.warn(`Found ${warnings.length} warning(s):`);
            warnings.forEach((warning) => console.log(`  ⚠ ${warning}`));
        }
    }

    if (issues.length > 0) {
        logger.newLine();
        logger.info('To fix registry issues, delete index.ts and run component commands to regenerate it.');
    }
}

async function generateComponentDocs(config: any): Promise<void> {
    logger.info('Generating component documentation...');

    const customComponentsDir = fileManager.resolvePath(config.components.customDirectory);
    const componentFiles = await fileManager.findFiles('*.svelte', customComponentsDir);

    if (componentFiles.length === 0) {
        logger.warn('No components found to document.');
        return;
    }

    let docsContent = `# Custom Components Documentation

This documentation is auto-generated for your Pika custom components.

## Available Components

`;

    for (const componentFile of componentFiles) {
        const componentPath = path.join(customComponentsDir, componentFile);
        const componentInfo = await analyzeComponent(componentPath);

        docsContent += `### ${componentInfo.name}

${componentInfo.description || 'No description available.'}

**Usage:**
\`\`\`
<${componentInfo.name}${generateUsageExample({ props: componentInfo.props })}>
\`\`\`

`;

        if (componentInfo.props.length > 0) {
            docsContent += `**Props:**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
`;
            componentInfo.props.forEach((prop) => {
                docsContent += `| ${prop.name} | ${prop.type} | ${prop.required ? 'Yes' : 'No'} | ${prop.default || '-'} | - |\n`;
            });
            docsContent += '\n';
        }

        docsContent += `**File:** \`${componentFile}\`\n\n`;
    }

    const docsPath = path.join(customComponentsDir, 'README.md');
    await fileManager.writeFile(docsPath, docsContent);

    logger.success(`Documentation generated: ${docsPath}`);
}
