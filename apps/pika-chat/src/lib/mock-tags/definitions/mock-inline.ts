import type { TagDefinitionForCreateOrUpdate, TagDefinitionWidgetWebComponent } from 'pika-shared/types/chatbot/chatbot-types';

const mockInline: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponent> = {
    tag: 'mock-inline',
    scope: 'pika',
    shortTagEx: '<pika.mock-inline></pika.mock-inline>',
    tagTitle: 'Mock Inline Widget',
    description: 'A mock widget for testing inline message rendering',
    canBeGeneratedByLlm: true,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: true,
    renderingContexts: {
        inline: {
            enabled: true
        }
    },
    displayMetadata: {
        icon: 'MessageSquare',
        category: 'Mock'
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'hello-world',
            s3: {
                s3Bucket: '',
                s3Key: 'wc/pika/hello-world.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    },
    llmInstructionsMd: `  - To include a mock inline widget, use the \`<pika.mock-inline></pika.mock-inline>\` tags.
  - This is a test widget for development and testing purposes.
  - Example: \`<pika.mock-inline>Test content</pika.mock-inline>\``
};

export default mockInline;
