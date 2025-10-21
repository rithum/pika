import type { TagDefinitionForCreateOrUpdate, TagDefinitionWidgetWebComponentForCreateOrUpdate } from 'pika-shared/types/chatbot/chatbot-types';

const mockSpotlightFixed: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponentForCreateOrUpdate> = {
    tag: 'mock-spotlight-fixed',
    scope: 'pika',
    shortTagEx: '<pika.mock-spotlight-fixed></pika.mock-spotlight-fixed>',
    tagTitle: 'Mock Fixed Spotlight',
    description: 'A mock spotlight widget with fixed positioning',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: true,
    renderingContexts: {
        spotlight: {
            enabled: true,
            isDefault: true
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

export default mockSpotlightFixed;
