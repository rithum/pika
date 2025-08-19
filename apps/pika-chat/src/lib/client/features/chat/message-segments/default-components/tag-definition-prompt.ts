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
    shortTagEx: '<image></image>',
    widget: {
        type: 'pika-compiled-in'
    },
    llmInstructions: [
        {
            type: 'line',
            mdLine: 'To suggest follow-up questions, use the `<prompt></prompt>` tag for EACH suggestion.'
        },
        {
            type: 'line',
            mdLine: "The text within the tag should be phrased as a command from the user's perspective and must be in the imperative voice, as if it were a command."
        },
        {
            type: 'line',
            mdLine: 'You can include multiple `<prompt/>` tags in your response.'
        },
        {
            type: 'line',
            mdLine: 'Include them directly within the response answer.'
        },
        {
            type: 'block',
            title: 'Examples',
            lines: [
                {
                    type: 'line',
                    mdLine: '<prompt>Compare the weather at this time last year also.</prompt>'
                },
                {
                    type: 'line',
                    mdLine: '<prompt>Explain the sales guide for this product.</prompt>'
                }
            ]
        }
    ]
};

export default tagDefinition;
