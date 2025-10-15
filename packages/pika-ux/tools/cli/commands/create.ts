import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { logger } from '../utils/logger.js';
import { validateProjectName, toHumanReadable } from '../utils/validation.js';
import { copyAndProcessTemplate } from '../utils/template.js';
import { createRequire } from 'module';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

interface CreateOptions {
    projectName?: string;
    humanReadableName?: string;
}

export async function createCommand(options: CreateOptions = {}): Promise<void> {
    try {
        logger.newLine();
        console.log(chalk.bold.cyan('Create Pika Webcomponent Application'));
        logger.divider();

        // Prompt for project name if not provided
        let projectName = options.projectName;
        if (!projectName) {
            const nameAnswer = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'projectName',
                    message: 'Project name:',
                    default: 'my-webcomponent',
                    validate: validateProjectName
                }
            ]);
            projectName = nameAnswer.projectName;
        } else {
            // Validate provided project name
            const validation = validateProjectName(projectName);
            if (validation !== true) {
                logger.error(validation as string);
                process.exit(1);
            }
        }

        // Generate suggested human-readable name
        const suggestedName = toHumanReadable(projectName as string);

        // Prompt for human-readable name
        let humanReadableName = options.humanReadableName;
        if (!humanReadableName) {
            const humanNameAnswer = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'humanReadableName',
                    message: 'Human-readable project name:',
                    default: suggestedName
                }
            ]);
            humanReadableName = humanNameAnswer.humanReadableName;
        }

        const targetPath = path.resolve(process.cwd(), projectName as string);

        // Check if directory already exists
        if (await fs.pathExists(targetPath)) {
            const { overwrite } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'overwrite',
                    message: `Directory "${projectName}" already exists. Overwrite?`,
                    default: false
                }
            ]);

            if (!overwrite) {
                logger.warn('Project creation cancelled.');
                process.exit(0);
            }

            await fs.remove(targetPath);
        }

        const spinner = logger.startSpinner('Creating project...');

        try {
            // Get pika-ux version - use require.resolve to find the installed package
            let pikaUxVersion = '1.0.0-beta.4'; // fallback version
            try {
                const pikaUxPackageJsonPath = require.resolve('pika-ux/package.json');
                const pikaUxPackageJson = await fs.readJson(pikaUxPackageJsonPath);
                pikaUxVersion = pikaUxPackageJson.version;
            } catch (error) {
                logger.debug('Could not determine pika-ux version, using fallback');
            }

            // Get template directory - find it relative to the pika-ux package
            let templateDir: string;
            try {
                const pikaUxRoot = path.dirname(require.resolve('pika-ux/package.json'));
                templateDir = path.join(pikaUxRoot, 'dist/cli/template-files');
                logger.debug(`Template directory resolved to: ${templateDir}`);
            } catch (error) {
                // Fallback: we're running from the bundled CLI, navigate from there
                // __dirname will be something like: .../node_modules/pika-ux/dist/cli
                templateDir = path.join(__dirname, 'template-files');
                logger.debug(`Using fallback template directory: ${templateDir}`);
            }

            // Verify template directory exists
            if (!(await fs.pathExists(templateDir))) {
                throw new Error(`Template directory not found: ${templateDir}`);
            }

            // Copy and process template
            logger.updateSpinner('Processing template files...');
            await copyAndProcessTemplate(templateDir, targetPath, {
                projectName: projectName as string,
                humanReadableProjectName: humanReadableName as string,
                pikaUxVersion
            });

            logger.debug(`Files copied to: ${targetPath}`);

            logger.stopSpinner(true, 'Template files processed');

            // Install dependencies
            const installSpinner = logger.startSpinner('Installing dependencies with pnpm...');
            try {
                await execAsync('pnpm install', { cwd: targetPath });
                logger.stopSpinner(true, 'Dependencies installed');
            } catch (error) {
                logger.stopSpinner(false, 'Failed to install dependencies');
                logger.warn('You can install dependencies manually:');
                console.log(`  cd ${projectName} && pnpm install`);
            }

            // Show completion message
            showCompletionMessage(projectName as string, targetPath);
        } catch (error) {
            logger.stopSpinner(false, 'Failed to create project');
            throw error;
        }
    } catch (error) {
        logger.error('Failed to create webcomponent application:');
        console.error(error);
        process.exit(1);
    }
}

function showCompletionMessage(projectName: string, projectPath: string): void {
    logger.newLine();
    console.log(chalk.green.bold(`✓ Successfully created ${projectName}!`));
    logger.newLine();

    console.log(chalk.bold('Next steps:'));
    // Use forward slashes for cross-platform display (works on Windows too)
    const relativePath = path.relative(process.cwd(), projectPath).split(path.sep).join('/');
    console.log(chalk.gray(`  cd ${relativePath}`));
    console.log(chalk.gray('  pnpm dev      # Start development server'));
    console.log(chalk.gray('  pnpm build    # Build for production'));
    logger.newLine();

    console.log(chalk.bold('Available commands:'));
    console.log(chalk.gray('  pnpm dev      - Start Vite dev server'));
    console.log(chalk.gray('  pnpm build    - Build for production'));
    console.log(chalk.gray('  pnpm preview  - Preview production build'));
    console.log(chalk.gray('  pnpm check    - Run type checking'));
    logger.newLine();

    console.log(chalk.bold('Learn more:'));
    console.log(chalk.gray('  • Pika UX Components: https://github.com/rithum/pika'));
    console.log(chalk.gray('  • Svelte Documentation: https://svelte.dev'));
    console.log(chalk.gray('  • Tailwind CSS: https://tailwindcss.com'));
    logger.newLine();
}
