import { describe, it, expect } from '@jest/globals';
import { resolveApiRoute } from '../../src/lib/custom/local-api-route';

const DEPLOYED = 'https://abc.execute-api.us-east-1.amazonaws.com/test';

describe('resolveApiRoute', () => {
    it('signs and targets the API Gateway URL when deployed', () => {
        const route = resolveApiRoute(false, DEPLOYED, '/api/chat?x=1', 'http://127.0.0.1:3001');
        expect(route.sign).toBe(true);
        expect(route.url.toString()).toBe('https://abc.execute-api.us-east-1.amazonaws.com/api/chat?x=1');
    });

    it('uses the deployed route when local with no base', () => {
        const route = resolveApiRoute(true, DEPLOYED, '/api/chat');
        expect(route.sign).toBe(true);
        expect(route.url.hostname).toBe('abc.execute-api.us-east-1.amazonaws.com');
    });

    it('sends unsigned to a loopback base and joins the path', () => {
        const route = resolveApiRoute(true, DEPLOYED, '/api/chat?x=1', 'http://127.0.0.1:3001');
        expect(route.sign).toBe(false);
        expect(route.url.toString()).toBe('http://127.0.0.1:3001/api/chat?x=1');
    });

    it.each(['http://localhost:4000/dev', 'http://localhost:4000/dev/'])('keeps the path prefix of %s when joining an absolute path', (base) => {
        const route = resolveApiRoute(true, DEPLOYED, '/chat/foo', base);
        expect(route.url.toString()).toBe('http://localhost:4000/dev/chat/foo');
    });

    it('accepts an IPv6 loopback base', () => {
        const route = resolveApiRoute(true, DEPLOYED, '/api/chat', 'http://[::1]:3001');
        expect(route.sign).toBe(false);
        expect(route.url.hostname).toBe('[::1]');
    });

    it('throws for a non-loopback base', () => {
        expect(() => resolveApiRoute(true, DEPLOYED, '/api/chat', 'http://example.com')).toThrow(/must be loopback/);
    });
});
