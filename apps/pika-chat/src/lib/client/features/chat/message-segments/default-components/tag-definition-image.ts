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
    shortTagEx: '<pika.image></pika.image>',
    status: 'enabled',
    chatAppId: 'chat-app-global',
    renderingContexts: {
        inline: { enabled: true }
    },
    widget: {
        type: 'pika-compiled-in'
    },
    llmInstructionsMd: `  - To include an image, use the \`<pika.image></pika.image>\` tags.
  - Wrap the URL in an image tag as in <pika.image>http://some.url</pika.image>
  - **Example:** \`<pika.image>https://example.com/image.png</pika.image>\`
  - **Usage:** Include images as it enhances responses`
};

export default tagDefinition;
