import type { TagDefinitionForCreateOrUpdate, TagDefinitionWidgetWebComponent } from 'pika-shared/types/chatbot/chatbot-types';

const mockDialog: TagDefinitionForCreateOrUpdate<TagDefinitionWidgetWebComponent> = {
    tag: 'mock-dialog',
    scope: 'pika',
    shortTagEx: '<pika.mock-dialog></pika.mock-dialog>',
    tagTitle: 'Mock Dialog Widget',
    description: 'A mock widget for testing dialog functionality',
    canBeGeneratedByLlm: false,
    canBeGeneratedByTool: false,
    chatAppId: 'weather',
    status: 'enabled',
    isMock: true,
    renderingContexts: {
        dialog: {
            enabled: true
        }
    },
    displayMetadata: {
        icon: 'Square',
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

export default mockDialog;
