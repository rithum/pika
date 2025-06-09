import { ChatApp, FeatureIdType, ChatAppFeature, FileUploadFeature, SuggestionsFeature } from '@pika/shared/types/chatbot/chatbot-types';
import { recordsHaveSameElements } from '../src/lib/chat-admin-utils';

describe('Features Type Change Verification', () => {
    test('should work with Partial<Record<FeatureIdType, ChatAppFeature>> type', () => {
        const features1: Partial<Record<FeatureIdType, ChatAppFeature>> = {
            fileUpload: {
                featureId: 'fileUpload',
                featureName: 'File Upload',
                enabled: true,
                defaultEnabledValue: false,
                mimeTypesAllowed: ['text/csv', 'application/json']
            } as FileUploadFeature,
            suggestions: {
                featureId: 'suggestions',
                featureName: 'Suggestions',
                enabled: true,
                defaultEnabledValue: false,
                suggestions: ['How can I help you?', 'What would you like to know?']
            } as SuggestionsFeature
        };

        const features2: Partial<Record<FeatureIdType, ChatAppFeature>> = {
            fileUpload: {
                featureId: 'fileUpload',
                featureName: 'File Upload',
                enabled: true,
                defaultEnabledValue: false,
                mimeTypesAllowed: ['text/csv', 'application/json']
            } as FileUploadFeature,
            suggestions: {
                featureId: 'suggestions',
                featureName: 'Suggestions',
                enabled: true,
                defaultEnabledValue: false,
                suggestions: ['How can I help you?', 'What would you like to know?']
            } as SuggestionsFeature
        };

        // Test that recordsHaveSameElements works with the new Partial<Record> type
        expect(recordsHaveSameElements(features1, features2)).toBe(true);
    });

    test('should detect differences in Partial<Record> features', () => {
        const features1: Partial<Record<FeatureIdType, ChatAppFeature>> = {
            fileUpload: {
                featureId: 'fileUpload',
                featureName: 'File Upload',
                enabled: true,
                defaultEnabledValue: false,
                mimeTypesAllowed: ['text/csv']
            } as FileUploadFeature
        };

        const features2: Partial<Record<FeatureIdType, ChatAppFeature>> = {
            fileUpload: {
                featureId: 'fileUpload',
                featureName: 'File Upload',
                enabled: true,
                defaultEnabledValue: false,
                mimeTypesAllowed: ['text/csv', 'application/json']
            } as FileUploadFeature
        };

        // Test that recordsHaveSameElements detects differences
        expect(recordsHaveSameElements(features1, features2)).toBe(false);
    });

    test('should work with ChatApp interface using Partial<Record> features', () => {
        const chatApp: ChatApp = {
            chatAppId: 'test-app',
            mode: 'fullpage',
            title: 'Test App',
            agentId: 'test-agent',
            features: {
                fileUpload: {
                    featureId: 'fileUpload',
                    featureName: 'File Upload',
                    enabled: true,
                    defaultEnabledValue: false,
                    mimeTypesAllowed: ['*']
                } as FileUploadFeature
            },
            enabled: true,
            createDate: '2024-01-01T00:00:00Z',
            lastUpdate: '2024-01-01T00:00:00Z'
        };

        // Test that we can access features as a Partial<Record>
        expect(chatApp.features).toBeDefined();
        expect(chatApp.features?.fileUpload).toBeDefined();
        expect(chatApp.features?.fileUpload?.enabled).toBe(true);
    });

    test('should handle undefined features', () => {
        const features1: Partial<Record<FeatureIdType, ChatAppFeature>> | undefined = undefined;
        const features2: Partial<Record<FeatureIdType, ChatAppFeature>> | undefined = undefined;

        expect(recordsHaveSameElements(features1, features2)).toBe(true);
    });

    test('should handle one undefined and one defined features', () => {
        const features1: Partial<Record<FeatureIdType, ChatAppFeature>> | undefined = undefined;
        const features2: Partial<Record<FeatureIdType, ChatAppFeature>> = {
            fileUpload: {
                featureId: 'fileUpload',
                featureName: 'File Upload',
                enabled: true,
                defaultEnabledValue: false,
                mimeTypesAllowed: ['*']
            } as FileUploadFeature
        };

        expect(recordsHaveSameElements(features1, features2)).toBe(false);
        expect(recordsHaveSameElements(features2, features1)).toBe(false);
    });
}); 