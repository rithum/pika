// Load environment variables first
import './env-setup';

import { POST as pinSession, DELETE as unpinSession } from '../../src/routes/(auth)/api/session/pinned/+server';
import { POST as searchPinned } from '../../src/routes/(auth)/api/session/pinned/search/+server';
import { callWithSvelteKitErrorHandling } from '../__mocks__/@sveltejs-kit';
import type { GetPinnedSessionsRequest, PinSessionRequest, UnpinSessionRequest } from './general-mocks';
import { createMockRequestEvent, ESSENTIAL_TEST_DATA, generateTestId, setupTestEnvironment } from './general-mocks';
import { externalAcmeUser1 } from './user-mock';

// Test data - will be set up during test environment initialization
let testSessionId: string;
let testShareId: string;

beforeAll(async () => {
    await setupTestEnvironment();
    testSessionId = generateTestId('test-session');
    testShareId = generateTestId('test-share');
}, 30000); // 30 second timeout for setup

describe('Pinned Session Integration Tests', () => {
    describe('Pin Session', () => {
        test('should pin own session', async () => {
            const request: PinSessionRequest = {
                pinnedSession: {
                    sessionId: testSessionId,
                    userId: externalAcmeUser1.userId,
                    chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ID,
                    pinnedAt: new Date().toISOString(),
                    testType: 'mock'
                }
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, request);
            const response = await callWithSvelteKitErrorHandling(pinSession, mockEvent as any);

            expect(response.status).toBe(200);
        });

        test('should pin shared session', async () => {
            const request: PinSessionRequest = {
                pinnedSession: {
                    shareId: testShareId,
                    userId: externalAcmeUser1.userId,
                    chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ID,
                    pinnedAt: new Date().toISOString(),
                    testType: 'mock'
                }
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, request);
            const response = await callWithSvelteKitErrorHandling(pinSession, mockEvent as any);

            expect(response.status).toBe(200);
        });

        test('should reject invalid session/share combinations', async () => {
            const request: PinSessionRequest = {
                pinnedSession: {
                    // Missing both sessionId and shareId
                    userId: externalAcmeUser1.userId,
                    chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ID,
                    pinnedAt: new Date().toISOString(),
                    testType: 'mock'
                }
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, request);
            const response = await callWithSvelteKitErrorHandling(pinSession, mockEvent as any);

            expect(response.status).toBe(400);
        });
    });

    describe('Unpin Session', () => {
        test('should unpin session', async () => {
            const request: UnpinSessionRequest = {
                sessionId: testSessionId,
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ID
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, request);
            const response = await callWithSvelteKitErrorHandling(unpinSession, mockEvent as any);

            expect(response.status).toBe(200);
        });
    });

    describe('Search Pinned', () => {
        test('should return pinned sessions with pagination', async () => {
            const request: GetPinnedSessionsRequest = {
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ID,
                limit: 10
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, request);
            const response = await callWithSvelteKitErrorHandling(searchPinned, mockEvent as any);

            expect(response.status).toBe(200);

            const result = await response.json();
            expect(result.success).toBe(true);
            expect(Array.isArray(result.results)).toBe(true);
        });

        test('should filter by chat app', async () => {
            const request: GetPinnedSessionsRequest = {
                chatAppId: ESSENTIAL_TEST_DATA.CHAT_APP_ID
            };

            const mockEvent = createMockRequestEvent(externalAcmeUser1, request);
            const response = await callWithSvelteKitErrorHandling(searchPinned, mockEvent as any);

            expect(response.status).toBe(200);

            const result = await response.json();
            expect(result.success).toBe(true);
            expect(Array.isArray(result.results)).toBe(true);
        });
    });
});
