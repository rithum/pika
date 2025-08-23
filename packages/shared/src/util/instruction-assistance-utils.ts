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
    console.log('Generating instruction assistance content:', {
        enabled: agentInstructionFeature?.enabled,
        includeOutputFormattingRequirements: agentInstructionFeature?.includeOutputFormattingRequirements,
        includeInstructionsForTags: agentInstructionFeature?.includeInstructionsForTags,
        completeExampleEnabled: agentInstructionFeature?.completeExampleInstructionEnabled,
        jsonOnlyEnabled: agentInstructionFeature?.jsonOnlyImperativeInstructionEnabled
    });

    let outputFormattingRequirements = '';
    let tagInstructions = '';
    let completeExampleInstructionLine = '';
    let jsonOnlyImperativeInstructionLine = '';

    if (!agentInstructionFeature?.enabled) {
        return {
            outputFormattingRequirements,
            tagInstructions,
            completeExampleInstructionLine,
            jsonOnlyImperativeInstructionLine
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
    if (agentInstructionFeature.includeInstructionsForTags && tags && tags.tagsEnabled?.length > 0) {
        console.log('Fetching tag definitions for instruction generation:', tags.tagsEnabled);

        if (tagDefinitions.length > 0) {
            // First create a dictionary listing all supported tags
            const tagDictionary = tagDefinitions
                .filter((tagDef) => tagDef.canBeGeneratedByLlm && !tagDef.disabled)
                .map((tagDef) => `  - ${tagDef.tagTitle}: \`${tagDef.shortTagEx}\``)
                .join('\n');

            let tagInstructionsContent = '';
            if (tagDictionary) {
                tagInstructionsContent += `- **Custom Tags Supported:**\n${tagDictionary}\n`;
            }

            // Then add detailed instructions for each tag
            for (const tagDef of tagDefinitions) {
                if (tagDef.canBeGeneratedByLlm && !tagDef.disabled && tagDef.llmInstructionsMd) {
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

    console.log('Generated instruction assistance content:', {
        hasOutputFormatting: !!outputFormattingRequirements,
        hasTagInstructions: !!tagInstructions,
        hasCompleteExample: !!completeExampleInstructionLine,
        hasJsonValidation: !!jsonOnlyImperativeInstructionLine
    });

    return {
        outputFormattingRequirements,
        tagInstructions,
        completeExampleInstructionLine,
        jsonOnlyImperativeInstructionLine
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
 * Get the instruction assistance configuration from raw SSM parameters
 *
 * @param params - The raw SSM parameters
 * @returns The instruction assistance configuration
 */
export function getInstructionsAssistanceConfigFromRawSsmParams(params: Record<string, string>): InstructionAssistanceConfig {
    const expectedKeys = ['output-formatting-requirements', 'default-complete-example-line', 'default-json-validation-line'];
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
        jsonOnlyImperativeInstructionLine: params['default-json-validation-line']
    };
}
