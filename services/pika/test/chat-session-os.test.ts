/// <reference types="jest" />

import { SessionSearchRequest, SessionSearchResponse } from 'pika-shared/types/chatbot/chatbot-types';
import { queryForSessions } from '../src/lib/opensearch/opensearch';

/**
 * Integration tests for OpenSearch Chat Session functionality
 *
 * This file contains tests for the session search functionality:
 * - Testing queryForSessions with various search parameters
 * - Testing pagination and sorting
 * - Testing filtering capabilities
 *
 * To run these tests:
 * Run: pnpm test
 */

// Setup environment variables required for OpenSearch tests
beforeAll(() => {
    process.env.PIKA_DOMAIN_ENDPOINT = 'search-pika-test-cyx7qrkojtwf4lbvcorpbztbby.us-east-1.es.amazonaws.com';
    process.env.stage = 'test';
    process.env.AWS_REGION = 'us-east-1';
});

describe('ChatSession OpenSearch Tests', () => {
    describe('Basic Session Search', () => {
        test('should perform simplest search with no parameters', async () => {
            // Arrange - empty search request (all parameters are optional)
            const searchRequest: SessionSearchRequest = {};

            // Act
            const result: SessionSearchResponse = await queryForSessions(searchRequest);
            console.log(`result: ${JSON.stringify(result, null, 2)}`);

            // Assert
            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(Array.isArray(result.sessions)).toBe(true);
            expect(typeof result.total).toBe('number');
            expect(typeof result.pageSize).toBe('number');

            // Log some basic info about the results
            console.log('Search completed successfully');
            console.log(`Total sessions found: ${result.total}`);
            console.log(`Sessions returned: ${result.sessions.length}`);
            console.log(`Page size: ${result.pageSize}`);

            if (result.scrollId) {
                console.log('ScrollId returned for pagination');
            }
        });
    });
});
