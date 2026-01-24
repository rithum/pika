/**
 * Intent Router Command Validation
 *
 * Validates IntentRouterCommand definitions before they are saved.
 * Used by both the admin UI and CloudFormation custom resource.
 *
 * @since 0.18.0
 */

import type {
    IntentRouterCommand,
    PikaCommand,
    CommandValidationError,
    CommandValidationResult,
    CommandsValidationResult
} from '../types/chatbot/intent-router-types';

// Re-export types for consumers of this module
export type { CommandValidationError, CommandValidationResult, CommandsValidationResult };

// Valid PikaCommand types
const VALID_COMMAND_TYPES = ['renderTag', 'closeCanvas', 'closeDialog', 'closeHero', 'showHero', 'hideHero', 'showToast', 'navigateTo', 'custom'] as const;

// Valid rendering contexts
const VALID_RENDERING_CONTEXTS = ['canvas', 'dialog', 'hero', 'spotlight'] as const;

// Valid toast variants
const VALID_TOAST_VARIANTS = ['success', 'error', 'info', 'warning'] as const;

// Command ID pattern: lowercase letters, numbers, underscores, starting with letter
const COMMAND_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

// Tag ID pattern: scope.tag format
const TAG_ID_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;

/**
 * Validate a single IntentRouterCommand.
 */
export function validateCommand(command: IntentRouterCommand): CommandValidationResult {
    const errors: CommandValidationError[] = [];

    // Required fields
    if (!command.commandId) {
        errors.push({ field: 'commandId', message: 'Command ID is required' });
    } else if (!COMMAND_ID_PATTERN.test(command.commandId)) {
        errors.push({
            field: 'commandId',
            message: 'Command ID must start with a lowercase letter and contain only lowercase letters, numbers, and underscores',
            value: command.commandId
        });
    }

    if (!command.name || !command.name.trim()) {
        errors.push({ field: 'name', message: 'Name is required' });
    }

    if (!command.description || !command.description.trim()) {
        errors.push({ field: 'description', message: 'Description is required' });
    }

    // Examples validation
    if (!command.examples || !Array.isArray(command.examples)) {
        errors.push({ field: 'examples', message: 'Examples must be an array' });
    } else if (command.examples.length === 0) {
        errors.push({ field: 'examples', message: 'At least one example is required' });
    } else {
        const validExamples = command.examples.filter((e) => typeof e === 'string' && e.trim());
        if (validExamples.length === 0) {
            errors.push({ field: 'examples', message: 'At least one non-empty example is required' });
        }
    }

    // Anti-examples validation (optional but must be valid if provided)
    if (command.antiExamples !== undefined) {
        if (!Array.isArray(command.antiExamples)) {
            errors.push({ field: 'antiExamples', message: 'Anti-examples must be an array' });
        }
    }

    // Priority validation
    if (typeof command.priority !== 'number') {
        errors.push({ field: 'priority', message: 'Priority must be a number' });
    } else if (command.priority < 0 || command.priority > 1000) {
        errors.push({
            field: 'priority',
            message: 'Priority must be between 0 and 1000',
            value: command.priority
        });
    }

    // Confidence threshold validation (optional)
    if (command.confidenceThreshold !== undefined) {
        if (typeof command.confidenceThreshold !== 'number') {
            errors.push({ field: 'confidenceThreshold', message: 'Confidence threshold must be a number' });
        } else if (command.confidenceThreshold < 0 || command.confidenceThreshold > 1) {
            errors.push({
                field: 'confidenceThreshold',
                message: 'Confidence threshold must be between 0 and 1',
                value: command.confidenceThreshold
            });
        }
    }

    // RequiresContext validation (optional)
    if (command.requiresContext !== undefined) {
        if (!Array.isArray(command.requiresContext)) {
            errors.push({ field: 'requiresContext', message: 'RequiresContext must be an array of strings' });
        } else {
            for (let i = 0; i < command.requiresContext.length; i++) {
                const path = command.requiresContext[i];
                if (typeof path !== 'string' || !path.trim()) {
                    errors.push({
                        field: `requiresContext[${i}]`,
                        message: 'Context path must be a non-empty string',
                        value: path
                    });
                }
            }
        }
    }

    // Execution validation
    if (!command.execution) {
        errors.push({ field: 'execution', message: 'Execution configuration is required' });
    } else {
        const executionErrors = validateExecution(command.execution);
        errors.push(...executionErrors);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate the execution configuration of a command.
 */
function validateExecution(execution: IntentRouterCommand['execution']): CommandValidationError[] {
    const errors: CommandValidationError[] = [];

    // Cast to unknown then to Record for flexible validation - we want to catch invalid modes at runtime
    const exec = execution as unknown as Record<string, unknown>;
    const mode = exec.mode as string | undefined;

    if (!mode) {
        errors.push({ field: 'execution.mode', message: 'Execution mode is required' });
        return errors;
    }

    if (mode !== 'direct' && mode !== 'dispatch') {
        // Note: 'enrich' and 'enrich-and-action' are not yet implemented
        if (mode === 'enrich' || mode === 'enrich-and-action') {
            errors.push({
                field: 'execution.mode',
                message: `Execution mode '${mode}' is not yet implemented. Use 'direct' or 'dispatch'.`,
                value: mode
            });
        } else {
            errors.push({
                field: 'execution.mode',
                message: `Invalid execution mode. Must be 'direct' or 'dispatch'.`,
                value: mode
            });
        }
        return errors;
    }

    if (execution.mode === 'direct') {
        // Direct mode requires a command
        if (!execution.command) {
            errors.push({ field: 'execution.command', message: 'Direct execution requires a command' });
        } else {
            const commandErrors = validatePikaCommand(execution.command, 'execution.command');
            errors.push(...commandErrors);
        }

        // passToAgent is optional boolean
        if (execution.passToAgent !== undefined && typeof execution.passToAgent !== 'boolean') {
            errors.push({ field: 'execution.passToAgent', message: 'passToAgent must be a boolean' });
        }
    }

    if (execution.mode === 'dispatch') {
        // Dispatch mode requires handlerTagId
        if (!execution.handlerTagId) {
            errors.push({ field: 'execution.handlerTagId', message: 'Dispatch execution requires handlerTagId' });
        } else if (!TAG_ID_PATTERN.test(execution.handlerTagId)) {
            errors.push({
                field: 'execution.handlerTagId',
                message: 'Handler tag ID must be in format "scope.tag" (e.g., "myapp.orchestrator")',
                value: execution.handlerTagId
            });
        }

        // payload is optional object
        if (execution.payload !== undefined && (typeof execution.payload !== 'object' || execution.payload === null || Array.isArray(execution.payload))) {
            errors.push({ field: 'execution.payload', message: 'Payload must be an object' });
        }
    }

    // responseTemplate is optional string (both modes)
    if (execution.responseTemplate !== undefined && typeof execution.responseTemplate !== 'string') {
        errors.push({ field: 'execution.responseTemplate', message: 'Response template must be a string' });
    }

    return errors;
}

/**
 * Validate a PikaCommand.
 */
function validatePikaCommand(command: PikaCommand, basePath: string): CommandValidationError[] {
    const errors: CommandValidationError[] = [];

    if (!command || typeof command !== 'object') {
        errors.push({ field: basePath, message: 'Command must be an object' });
        return errors;
    }

    if (!command.type) {
        errors.push({ field: `${basePath}.type`, message: 'Command type is required' });
        return errors;
    }

    if (!VALID_COMMAND_TYPES.includes(command.type as any)) {
        errors.push({
            field: `${basePath}.type`,
            message: `Invalid command type '${command.type}'. Valid types: ${VALID_COMMAND_TYPES.join(', ')}`,
            value: command.type
        });
        return errors;
    }

    switch (command.type) {
        case 'renderTag':
            if (!command.tagId) {
                errors.push({ field: `${basePath}.tagId`, message: 'Tag ID is required for renderTag command' });
            } else if (!TAG_ID_PATTERN.test(command.tagId) && !command.tagId.includes('{{')) {
                // Allow template syntax
                errors.push({
                    field: `${basePath}.tagId`,
                    message: 'Tag ID must be in format "scope.tag" (e.g., "myapp.widget")',
                    value: command.tagId
                });
            }

            if (!command.renderingContext) {
                errors.push({ field: `${basePath}.renderingContext`, message: 'Rendering context is required for renderTag command' });
            } else if (!VALID_RENDERING_CONTEXTS.includes(command.renderingContext as any)) {
                errors.push({
                    field: `${basePath}.renderingContext`,
                    message: `Invalid rendering context. Valid contexts: ${VALID_RENDERING_CONTEXTS.join(', ')}`,
                    value: command.renderingContext
                });
            }

            // data is optional object
            if (command.data !== undefined && (typeof command.data !== 'object' || command.data === null || Array.isArray(command.data))) {
                errors.push({ field: `${basePath}.data`, message: 'Data must be an object' });
            }

            // metadata is optional object
            if (command.metadata !== undefined && (typeof command.metadata !== 'object' || command.metadata === null || Array.isArray(command.metadata))) {
                errors.push({ field: `${basePath}.metadata`, message: 'Metadata must be an object' });
            }
            break;

        case 'showToast':
            if (!command.message || typeof command.message !== 'string') {
                errors.push({ field: `${basePath}.message`, message: 'Toast message is required and must be a string' });
            }
            if (!command.variant) {
                errors.push({ field: `${basePath}.variant`, message: 'Toast variant is required' });
            } else if (!VALID_TOAST_VARIANTS.includes(command.variant as any)) {
                errors.push({
                    field: `${basePath}.variant`,
                    message: `Invalid toast variant. Valid variants: ${VALID_TOAST_VARIANTS.join(', ')}`,
                    value: command.variant
                });
            }
            break;

        case 'navigateTo':
            if (!command.path || typeof command.path !== 'string') {
                errors.push({ field: `${basePath}.path`, message: 'Path is required for navigateTo command' });
            }
            break;

        case 'custom':
            if (!command.action || typeof command.action !== 'string') {
                errors.push({ field: `${basePath}.action`, message: 'Action is required for custom command' });
            }
            if (command.params !== undefined && (typeof command.params !== 'object' || command.params === null || Array.isArray(command.params))) {
                errors.push({ field: `${basePath}.params`, message: 'Params must be an object' });
            }
            break;

        // closeCanvas, closeDialog, closeHero, showHero, hideHero - no additional fields required
    }

    return errors;
}

/**
 * Validate an array of IntentRouterCommands.
 * Also checks for duplicate command IDs.
 */
export function validateCommands(commands: IntentRouterCommand[]): CommandsValidationResult {
    const errors: Array<CommandValidationError & { commandIndex: number; commandId?: string }> = [];

    if (!Array.isArray(commands)) {
        errors.push({
            commandIndex: -1,
            field: 'intentRouterCommands',
            message: 'intentRouterCommands must be an array'
        });
        return { valid: false, errors };
    }

    // Track command IDs for duplicate detection
    const seenIds = new Map<string, number>();

    for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        const commandId = command?.commandId;

        // Check for duplicates
        if (commandId) {
            const existingIndex = seenIds.get(commandId);
            if (existingIndex !== undefined) {
                errors.push({
                    commandIndex: i,
                    commandId,
                    field: 'commandId',
                    message: `Duplicate command ID '${commandId}' (also at index ${existingIndex})`,
                    value: commandId
                });
            } else {
                seenIds.set(commandId, i);
            }
        }

        // Validate individual command
        const result = validateCommand(command);
        for (const error of result.errors) {
            errors.push({
                commandIndex: i,
                commandId: commandId || undefined,
                ...error
            });
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Format validation errors into a human-readable message.
 */
export function formatValidationErrors(result: CommandsValidationResult): string {
    if (result.valid) {
        return 'No validation errors';
    }

    const lines: string[] = ['Intent Router command validation failed:'];

    for (const error of result.errors) {
        const prefix = error.commandIndex >= 0 ? `  [Command ${error.commandIndex}${error.commandId ? ` (${error.commandId})` : ''}]` : '  ';
        lines.push(`${prefix} ${error.field}: ${error.message}`);
    }

    return lines.join('\n');
}
