/**
 * Do not include any other imports in this file.  It is typescript only to give you the type of the tag definition.
 * Think of it is a json object.  You must return  `TagDefinitionForCreateOrUpdate<TagDefinitionWidgetPikaCompiledIn>`
 * as the default export.
 */
import type { TagDefinitionForCreateOrUpdate, TagDefinitionWidgetPikaCompiledIn } from 'pika-shared/types/chatbot/chatbot-types';

const tagDefinition: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetPikaCompiledIn> = {
    tag: 'download',
    legacyTagName: 'download',
    scope: 'pika',
    tagTitle: 'Downloads',
    description: 'Generates a download link for a file from S3.',
    canBeGeneratedByLlm: true,
    canBeGeneratedByTool: true,
    shortTagEx: '<pika.download></pika.download>',
    status: 'enabled',
    chatAppId: 'chat-app-global',
    renderingContexts: {
        inline: { enabled: true }
    },
    widget: {
        type: 'pika-compiled-in'
    },
    llmInstructionsMd: `  - When you encounter a URL with the format \`download://{s3-key}?title={title}\`, replace it with: \`<pika.download>{"s3Key":"{s3-key}","title":"{decoded-title}"}</pika.download>\`
  - **Rules**
    - Extract s3-key from the path
    - URL-decode title if present, omit if missing
    - Apply this replacement anywhere you'd output the URL
  - **Example:** \`download://doc-456?title=My%20Document\` →  \`<pika.download>{"s3Key":"doc-456","title":"My Document"}</pika.download>\``
};

export default tagDefinition;
