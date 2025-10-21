/**
 * IMPORTANT!!!!!!!!!!!!!!!!!!!!!!
 *
 * The functions in this utility are used both by the front end svelte kit web client in the browser
 * and in the backend lambda converse functions.  So, that means it needs to be able
 * to run in a browser.  Do not add additional imports beyond anodine types.
 *
 * To be super clear: this is just logic to generate instruction assistance content given
 * the right inputs.  It does not collect up those inputs, it is given them.
 *
 */

import type {
    AgentInstructionChatAppOverridableFeature,
    InstructionAssistanceConfig,
    TagDefinition,
    TagDefinitionWidget,
    TagsChatAppOverridableFeature
} from '../types/chatbot/chatbot-types';

/**
 * IMPORTANT!!!!!!!!!!!!!!!!!!!!!!
 *
 * See header at top of file for important notes.
 *
 * Generate instruction assistance content based on enabled features
 *
 * @param instructionAssistanceConfig - The instruction assistance configuration from SSM
 * @param tags - The tags configuration from the chat app
 * @param agentInstructionFeature - The agent instruction feature configuration from the chat app
 * @returns The instruction assistance content
 */
export function generateInstructionAssistanceContent(
    instructionAssistanceConfig: InstructionAssistanceConfig | undefined,
    tags: TagsChatAppOverridableFeature | undefined,
    agentInstructionFeature: AgentInstructionChatAppOverridableFeature | undefined,
    tagDefinitions: TagDefinition<TagDefinitionWidget>[]
): InstructionAssistanceConfig {
    let outputFormattingRequirements = '';
    let tagInstructions = '';
    let completeExampleInstructionLine = '';
    let jsonOnlyImperativeInstructionLine = '';
    let typescriptBackedOutputFormattingRequirements = '';

    if (!agentInstructionFeature?.enabled) {
        return {
            outputFormattingRequirements,
            tagInstructions,
            completeExampleInstructionLine,
            jsonOnlyImperativeInstructionLine,
            typescriptBackedOutputFormattingRequirements
        };
    }

    // Generate output formatting requirements
    if (agentInstructionFeature.includeOutputFormattingRequirements) {
        outputFormattingRequirements =
            instructionAssistanceConfig?.outputFormattingRequirements ||
            `**Output Formatting Requirements:**
- **Output Response Enclosure**: All response output MUST be completely enclosed within <answer></answer> tags, including supported custom tags.
- **Output Content Format:** All responses MUST be in Markdown with supported custom tags.`;
    }

    // Generate tag instructions
    if (agentInstructionFeature.includeInstructionsForTags && tags) {
        if (tagDefinitions.length > 0) {
            // Build a set of enabled tag identifiers
            const enabledTagIds = new Set<string>();

            // Add all explicitly enabled chat-app tags
            if (tags.tagsEnabled) {
                for (const tag of tags.tagsEnabled) {
                    const tagId = `${tag.scope}.${tag.tag}`;
                    enabledTagIds.add(tagId);
                }
            }

            // Add all global tags that aren't explicitly disabled
            const disabledTagIds = new Set<string>();
            if (tags.tagsDisabled) {
                for (const tag of tags.tagsDisabled) {
                    const tagId = `${tag.scope}.${tag.tag}`;
                    disabledTagIds.add(tagId);
                }
            }

            for (const tagDef of tagDefinitions) {
                if (tagDef.usageMode === 'global') {
                    const tagId = `${tagDef.scope}.${tagDef.tag}`;
                    if (!disabledTagIds.has(tagId)) {
                        enabledTagIds.add(tagId);
                    }
                }
            }

            // Filter to only include enabled tags
            const enabledTagDefinitions = tagDefinitions.filter((tagDef) => {
                const tagId = `${tagDef.scope}.${tagDef.tag}`;
                return enabledTagIds.has(tagId) && tagDef.canBeGeneratedByLlm && tagDef.status === 'enabled';
            });

            // First create a dictionary listing all supported tags
            const tagDictionary = enabledTagDefinitions.map((tagDef) => `  - ${tagDef.tagTitle}: \`${tagDef.shortTagEx}\``).join('\n');

            let tagInstructionsContent = '';
            if (tagDictionary) {
                tagInstructionsContent += `- **Custom Tags Supported:**\n${tagDictionary}\n`;
            }

            // Then add detailed instructions for each tag
            for (const tagDef of enabledTagDefinitions) {
                if (tagDef.llmInstructionsMd) {
                    const tagType = `${tagDef.scope}.${tagDef.tag}`;
                    tagInstructionsContent += `- **${tagDef.tagTitle}:**\n  <tag-instructions type="${tagType}">\n${tagDef.llmInstructionsMd}\n  </tag-instructions>\n`;
                }
            }

            if (tagInstructionsContent) {
                tagInstructions = tagInstructionsContent;
            }
        }
    }

    // Generate complete example instruction line
    if (agentInstructionFeature.completeExampleInstructionEnabled) {
        completeExampleInstructionLine =
            agentInstructionFeature.completeExampleInstructionLine ||
            instructionAssistanceConfig?.completeExampleInstructionLine ||
            '- **Complete Example Output:**\n  `<answer>##Example markdown\nNormal text and an <image>http://some.url</image> and some **bold text**\n<chart>(...)</chart></answer>`';
    }

    // Generate JSON validation instruction line
    if (agentInstructionFeature.jsonOnlyImperativeInstructionEnabled) {
        jsonOnlyImperativeInstructionLine =
            agentInstructionFeature.jsonOnlyImperativeInstructionLine ||
            instructionAssistanceConfig?.jsonOnlyImperativeInstructionLine ||
            'BE ABSOLUTELY CERTAIN ANY JSON INCLUDED IS 100% VALID (especially for charts). Invalid JSON will break the user experience.';
    }

    return {
        outputFormattingRequirements,
        tagInstructions,
        completeExampleInstructionLine,
        jsonOnlyImperativeInstructionLine,
        typescriptBackedOutputFormattingRequirements
    };
}

/**
 * IMPORTANT!!!!!!!!!!!!!!!!!!!!!!
 *
 * See header at top of file for important notes.
 *
 * Apply instruction assistance to the base prompt using placeholder replacement
 */
export function applyInstructionAssistance(basePrompt: string, instructionContent: InstructionAssistanceConfig): string {
    let enhancedPrompt = basePrompt;

    // Check for primary placeholder first
    if (enhancedPrompt.includes('{{prompt-assistance}}')) {
        console.log('Found {{prompt-assistance}} placeholder');

        const allContent = [
            instructionContent.outputFormattingRequirements,
            instructionContent.tagInstructions,
            instructionContent.completeExampleInstructionLine,
            instructionContent.jsonOnlyImperativeInstructionLine
        ]
            .filter((content) => content && content.trim().length > 0)
            .join('\n\n');

        enhancedPrompt = enhancedPrompt.replace('{{prompt-assistance}}', allContent);
    } else {
        // Look for fine-grained placeholders
        const placeholders = [
            { placeholder: '{{output-formatting-requirements}}', content: instructionContent.outputFormattingRequirements },
            { placeholder: '{{tag-instructions}}', content: instructionContent.tagInstructions },
            { placeholder: '{{complete-example-instruction-line}}', content: instructionContent.completeExampleInstructionLine },
            { placeholder: '{{json-only-imperative-instruction-line}}', content: instructionContent.jsonOnlyImperativeInstructionLine }
        ];

        let hasAnyPlaceholder = false;
        for (const { placeholder, content } of placeholders) {
            if (enhancedPrompt.includes(placeholder) && content) {
                console.log(`Found ${placeholder} placeholder`);
                hasAnyPlaceholder = true;
                enhancedPrompt = enhancedPrompt.replace(placeholder, content);
            }
        }

        // If no placeholders found, append to end
        if (!hasAnyPlaceholder) {
            console.log('No placeholders found, appending to end of prompt');
            const allContent = [
                instructionContent.outputFormattingRequirements,
                instructionContent.tagInstructions,
                instructionContent.completeExampleInstructionLine,
                instructionContent.jsonOnlyImperativeInstructionLine
            ].filter((content) => content && content.trim().length > 0);

            if (allContent.length > 0) {
                enhancedPrompt = enhancedPrompt + '\n\n' + allContent.join('\n\n');
            }
        }
    }

    return enhancedPrompt;
}

/**
 * IMPORTANT!!!!!!!!!!!!!!!!!!!!!!
 *
 * See header at top of file for important notes.
 *
 * Generate component-specific instruction content for direct component invocations
 *
 * @param tagDefinition - The tag definition with component invocation instructions
 * @param componentAgentInstructionName - The name of the instruction set to use
 * @param instructionAssistanceConfig - Optional instruction assistance config for placeholder replacement
 * @param agentInstructionFeature - Optional agent instruction feature to control which placeholders are replaced
 * @returns The component instruction content or undefined if not found
 */
export function generateComponentInstructionContent(
    tagDefinition: TagDefinition<TagDefinitionWidget>,
    componentAgentInstructionName: string,
    instructionAssistanceConfig?: InstructionAssistanceConfig,
    agentInstructionFeature?: AgentInstructionChatAppOverridableFeature
): string | undefined {
    console.log('Generating component instruction content:', {
        scope: tagDefinition.scope,
        tag: tagDefinition.tag,
        componentAgentInstructionName,
        hasDirectInvocationInstructions: !!tagDefinition.componentAgentInstructionsMd,
        hasInstructionAssistanceConfig: !!instructionAssistanceConfig
    });

    if (!tagDefinition.componentAgentInstructionsMd) {
        // console.log('No componentAgentInstructionsMd found on tag definition');
        return undefined;
    }

    const instructions = tagDefinition.componentAgentInstructionsMd[componentAgentInstructionName];

    if (!instructions) {
        console.log(`No instructions found for componentAgentInstructionName: ${componentAgentInstructionName}`);
        console.log('Available instruction names:', Object.keys(tagDefinition.componentAgentInstructionsMd));
        return undefined;
    }

    console.log('Component instructions found:', {
        instructionLength: instructions.length
    });

    // Apply placeholder replacement if instruction assistance config is provided
    if (instructionAssistanceConfig && agentInstructionFeature) {
        return applyComponentInstructionAssistance(instructions, instructionAssistanceConfig, agentInstructionFeature);
    }

    return instructions;
}

/**
 * IMPORTANT!!!!!!!!!!!!!!!!!!!!!!
 *
 * See header at top of file for important notes.
 *
 * Apply instruction assistance placeholder replacement to component instructions
 *
 * @param componentInstructions - The raw component instructions with placeholders
 * @param instructionConfig - The instruction assistance configuration
 * @param agentInstructionFeature - The agent instruction feature configuration
 * @returns The component instructions with placeholders replaced
 */
export function applyComponentInstructionAssistance(
    componentInstructions: string,
    instructionConfig: InstructionAssistanceConfig,
    agentInstructionFeature: AgentInstructionChatAppOverridableFeature
): string {
    let enhancedInstructions = componentInstructions;

    console.log('Applying component instruction assistance:', {
        includeTypescriptBackedOutputFormattingRequirements: agentInstructionFeature.includeTypescriptBackedOutputFormattingRequirements,
        hasPlaceholder: enhancedInstructions.includes('{{typescript-backed-output-formatting-requirements}}')
    });

    // Replace typescript-backed-output-formatting-requirements placeholder if enabled
    if (agentInstructionFeature.includeTypescriptBackedOutputFormattingRequirements && instructionConfig.typescriptBackedOutputFormattingRequirements) {
        const placeholder = '{{typescript-backed-output-formatting-requirements}}';
        if (enhancedInstructions.includes(placeholder)) {
            console.log('Replacing typescript-backed-output-formatting-requirements placeholder');
            enhancedInstructions = enhancedInstructions.replace(placeholder, instructionConfig.typescriptBackedOutputFormattingRequirements);
        }
    }

    return enhancedInstructions;
}

/**
 * IMPORTANT!!!!!!!!!!!!!!!!!!!!!!
 *
 * See header at top of file for important notes.
 *
 * Get the instruction assistance configuration from raw SSM parameters
 *
 * @param params - The raw SSM parameters
 * @returns The instruction assistance configuration
 */
export function getInstructionsAssistanceConfigFromRawSsmParams(params: Record<string, string>): InstructionAssistanceConfig {
    const expectedKeys = ['output-formatting-requirements', 'default-complete-example-line', 'default-json-validation-line', 'typescript-backed-output-formatting-requirements'];
    const missingKeys = expectedKeys.filter((key) => !params[key]);
    if (missingKeys.length > 0) {
        throw new Error(
            `Missing required instruction assistance parameters: ${Object.keys(params)
                .filter((key) => !expectedKeys.includes(key))
                .join(', ')}`
        );
    }

    return {
        outputFormattingRequirements: params['output-formatting-requirements'],
        completeExampleInstructionLine: params['default-complete-example-line'],
        jsonOnlyImperativeInstructionLine: params['default-json-validation-line'],
        typescriptBackedOutputFormattingRequirements: params['typescript-backed-output-formatting-requirements']
    };
}
