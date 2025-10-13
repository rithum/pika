import type { TagDefinitionForCreateOrUpdate, TagDefinitionWidgetWebComponentForCreateOrUpdate } from 'pika-shared/types/chatbot/chatbot-types';

const mockMultiContext: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'mock-multi-context',
    scope: 'pika',
    shortTagEx: '<pika.mock-multi-context></pika.mock-multi-context>',
    tagTitle: 'Mock Multi-Context Widget',
    description: 'A mock widget that works in multiple rendering contexts',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: true,
    renderingContexts: {
        spotlight: {
            enabled: true,
            isDefault: false
        },
        canvas: {
            enabled: true
        },
        dialog: {
            enabled: true
        }
    },
    widget: {
        type: 'web-component',
        webComponent: {
            customElementName: 'hello-world',
            s3: {
                s3Key: 'wc/pika/hello-world.js.gz'
            },
            encoding: 'gzip',
            mediaType: 'application/javascript',
            encodedSizeBytes: 0,
            encodedSha256Base64: ''
        }
    }
};

export default mockMultiContext;
