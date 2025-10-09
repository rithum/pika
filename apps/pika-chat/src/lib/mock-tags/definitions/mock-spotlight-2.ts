import type { TagDefinitionForCreateOrUpdate, TagDefinitionWidgetWebComponent } from 'pika-shared/types/chatbot/chatbot-types';

const mockSpotlight2: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponent> = {
    tag: 'mock-spotlight-2',
    scope: 'pika',
    shortTagEx: '<pika.mock-spotlight-2></pika.mock-spotlight-2>',
    tagTitle: 'Mock Spotlight Widget 2',
    description: 'Another mock widget for testing spotlight functionality',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: true,
    renderingContexts: {
        spotlight: {
            enabled: true,
            isDefault: false
        }
    },
    displayMetadata: {
        icon: 'Star',
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

export default mockSpotlight2;
