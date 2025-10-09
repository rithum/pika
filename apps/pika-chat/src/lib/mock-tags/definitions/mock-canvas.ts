import type { TagDefinitionForCreateOrUpdate, TagDefinitionWidgetWebComponent } from 'pika-shared/types/chatbot/chatbot-types';

const mockCanvas: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponent> = {
    tag: 'mock-canvas',
    scope: 'pika',
    shortTagEx: '<pika.mock-canvas></pika.mock-canvas>',
    tagTitle: 'Mock Canvas Widget',
    description: 'A mock widget for testing canvas functionality',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: true,
    renderingContexts: {
        canvas: {
            enabled: true
        }
    },
    displayMetadata: {
        icon: 'Layout',
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
    }
};

export default mockCanvas;
