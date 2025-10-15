/**
 * Do not include any other imports in this file.  It is typescript only to give you the type of the tag definition.
 * Think of it is a json object.  You must return  `TagDefinitionForCreateOrUpdate<TagDefinitionWidgetPikaCompiledIn>`
 * as the default export.
 */
import type { TagDefinitionForCreateOrUpdate, TagDefinitionWidgetPikaCompiledIn } from 'pika-shared/types/chatbot/chatbot-types';

const tagDefinition: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetPikaCompiledIn> = {
    tag: 'prompt',
    legacyTagName: 'prompt',
    scope: 'pika',
    tagTitle: 'Follow-up Prompts',
    description: 'A prompt is a recommended follow-up query that the user may click on to continue the conversation.',
    canBeGeneratedByLlm: true,
    canBeGeneratedByTool: true,
    shortTagEx: '<pika.prompt></pika.prompt>',
    status: 'enabled',
    chatAppId: 'chat-app-global',
    renderingContexts: {
        inline: { enabled: true }
    },
    widget: {
        type: 'pika-compiled-in'
    },
    llmInstructionsMd: `  - To suggest follow-up questions, use the \`<pika.prompt></pika.prompt>\` tag for EACH suggestion.
  - The text within the tag should be phrased as a command from the user's perspective and must be in the imperative voice, as if it were a command.
  - You can include multiple \`<pika.prompt/>\` tags in your response.
  - Include them directly within the response answer.
  - **Examples:**
    - \`<pika.prompt>Compare the weather at this time last year also.</pika.prompt>\`
    - \`<pika.prompt>Explain the sales guide for this product.</pika.prompt>\``
};

export default tagDefinition;
