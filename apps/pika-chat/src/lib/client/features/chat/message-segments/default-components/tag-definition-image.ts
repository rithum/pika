/**
 * Do not include any other imports in this file.  It is typescript only to give you the type of the tag definition.
 * Think of it is a json object.  You must return  `TagDefinitionForCreateOrUpdate<TagDefinitionWidgetPikaCompiledIn>`
 * as the default export.
 */
import type { TagDefinitionForCreateOrUpdate, TagDefinitionWidgetPikaCompiledIn } from 'pika-shared/types/chatbot/chatbot-types';

const tagDefinition: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetPikaCompiledIn> = {
    tag: 'image',
    legacyTagName: 'image',
    scope: 'pika',
    tagTitle: 'Images',
    description: 'An image as in a png, jpg, or gif.',
    canBeGeneratedByLlm: true,
    canBeGeneratedByTool: true,
    shortTagEx: '<image></image>',
    widget: {
        type: 'pika-compiled-in'
    },
    llmInstructions: [
        {
            type: 'line',
            mdLine: 'Include images as it enhances responses'
        },
        {
            type: 'line',
            mdLine: 'Wrap the URL in an image tag as in <image>http://some.url</image>'
        }
    ]
};

export default tagDefinition;
