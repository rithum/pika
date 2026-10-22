import { describe, it, expect } from '@jest/globals';
import { resolveLocalConverseRoute } from '../../src/lib/custom/local-converse-route';

describe('resolveLocalConverseRoute', () => {
    it('uses the configured URL when not local', () => {
        expect(resolveLocalConverseRoute(false, 'https://fn.example.com/', 'http://127.0.0.1:9000/')).toEqual({
            functionUrl: 'https://fn.example.com/',
            invokeInProcess: false
        });
    });

    it('invokes in process when local with no override', () => {
        expect(resolveLocalConverseRoute(true, 'https://fn.example.com/')).toEqual({
            functionUrl: 'https://fn.example.com/',
            invokeInProcess: true
        });
    });

    it('uses the override and skips in-process when local with an override', () => {
        expect(resolveLocalConverseRoute(true, 'https://fn.example.com/', 'http://127.0.0.1:9000/')).toEqual({
            functionUrl: 'http://127.0.0.1:9000/',
            invokeInProcess: false
        });
    });
});
