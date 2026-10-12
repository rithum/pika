import { describe, it, expect } from '@jest/globals';
import { createTraceRedactionStream, stepHandle } from '$lib/server/trace-stream-filter';

const ACTIVITY = '<trace>{"orchestrationTrace":{"rationale":{"traceId":"activity","text":""}}}</trace>';
const GET_WEATHER_HANDLE = 'e33637ee63';

async function run(chunks: (string | Uint8Array)[]): Promise<string> {
    const encoder = new TextEncoder();
    const input = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const c of chunks) {
                controller.enqueue(typeof c === 'string' ? encoder.encode(c) : c);
            }
            controller.close();
        }
    });
    const reader = input.pipeThrough(createTraceRedactionStream()).getReader();
    const decoder = new TextDecoder();
    let out = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            return out + decoder.decode();
        }
        out += decoder.decode(value, { stream: true });
    }
}

const frame = (payload: unknown) => `<trace>${JSON.stringify(payload)}</trace>`;

const invocationFrame = frame({
    orchestrationTrace: {
        invocationInput: {
            actionGroupInvocationInput: { function: 'get_weather', parameters: [{ name: 'city', value: 'Paris' }], userLabel: 'Checking' }
        }
    }
});

describe('createTraceRedactionStream', () => {
    it('passes text, heartbeat and metadata through byte-identical', async () => {
        const text = 'Hello <heartbeat/> world<pika-metadata>{"a":1}</pika-metadata> done';
        expect(await run([text])).toBe(text);
    });

    it('replaces an invocationInput frame with a label-only start step', async () => {
        const out = await run([invocationFrame]);
        expect(out).toBe(`<trace>{"step":{"event":"start","id":"${GET_WEATHER_HANDLE}","label":"Checking"}}</trace>`);
        expect(out).not.toContain('get_weather');
        expect(out).not.toContain('parameters');
    });

    it('replaces an observation frame with a done step', async () => {
        const out = await run([
            frame({ orchestrationTrace: { observation: { actionGroupInvocationOutput: { function: 'get_weather', text: 'secret output' } } } })
        ]);
        expect(out).toBe(`<trace>{"step":{"event":"done","id":"${GET_WEATHER_HANDLE}"}}</trace>`);
    });

    it('replaces a rationale text frame with the activity frame', async () => {
        expect(await run([frame({ orchestrationTrace: { rationale: { text: 'thinking about secrets' } } })])).toBe(ACTIVITY);
    });

    it('replaces llm-instruction rationale and preProcessingTrace frames with the activity frame', async () => {
        const llm = frame({ orchestrationTrace: { rationale: { traceId: 'llm-instruction', text: 'system prompt' } } });
        const pre = frame({ preProcessingTrace: { modelInvocationOutput: { rawResponse: { content: 'x' } } } });
        expect(await run([llm, pre])).toBe(ACTIVITY + ACTIVITY);
    });

    it('keeps only event, id, label and labelDone on an existing step frame', async () => {
        const out = await run([frame({ step: { event: 'start', id: 'abc', label: 'L', labelDone: 'D', extra: 'x', detail: { a: 1 } } })]);
        expect(out).toBe('<trace>{"step":{"event":"start","id":"abc","label":"L","labelDone":"D"}}</trace>');
    });

    it('omits empty or non-string labels on a step frame', async () => {
        const out = await run([frame({ step: { event: 'done', id: 'abc', label: '', labelDone: 5 } })]);
        expect(out).toBe('<trace>{"step":{"event":"done","id":"abc"}}</trace>');
    });

    it('passes the activity frame unchanged', async () => {
        expect(await run([ACTIVITY])).toBe(ACTIVITY);
    });

    it('turns invalid JSON into the activity frame', async () => {
        expect(await run(['<trace>{not json</trace>'])).toBe(ACTIVITY);
    });

    it('handles a frame split across 2 chunks', async () => {
        const expected = await run([invocationFrame]);
        const mid = Math.floor(invocationFrame.length / 2);
        expect(await run([invocationFrame.slice(0, mid), invocationFrame.slice(mid)])).toBe(expected);
    });

    it('handles a frame split inside the open and close tags across 3 chunks', async () => {
        const expected = await run([invocationFrame]);
        const closeAt = invocationFrame.indexOf('</trace>');
        expect(await run(['hi<tra', invocationFrame.slice(4, closeAt + 4), invocationFrame.slice(closeAt + 4)])).toBe(`hi${expected}`);
        expect(await run([invocationFrame.slice(0, 4), invocationFrame.slice(4, closeAt + 5), invocationFrame.slice(closeAt + 5)])).toBe(expected);
    });

    it('keeps order for two frames and text in one chunk', async () => {
        const out = await run([`a${invocationFrame}b${ACTIVITY}c`]);
        const startStep = `<trace>{"step":{"event":"start","id":"${GET_WEATHER_HANDLE}","label":"Checking"}}</trace>`;
        expect(out).toBe(`a${startStep}b${ACTIVITY}c`);
    });

    it('drops an unterminated frame and emits only the preceding text', async () => {
        const out = await run(['before ', '<trace>{"orchestrationTrace":{"rationale":{"text":"secret']);
        expect(out).toBe('before ');
        expect(out).not.toContain('secret');
    });

    it('emits a held "<tr" that turns out to be text, on the next chunk and at flush', async () => {
        expect(await run(['a <tr', 'ee> b'])).toBe('a <tree> b');
        expect(await run(['a <tr'])).toBe('a <tr');
        expect(await run(['a <', '<trace>{}</trace>'])).toBe(`a <${ACTIVITY}`);
    });

    it('preserves a multi-byte UTF-8 character split across chunks', async () => {
        const bytes = new TextEncoder().encode('café \u{1F600} ok');
        const cut = bytes.indexOf(0xf0) + 2;
        expect(await run([bytes.slice(0, cut), bytes.slice(cut)])).toBe('café \u{1F600} ok');
    });
});

describe('stepHandle', () => {
    it('matches the Python step_handle', () => {
        expect(stepHandle('get_weather')).toBe(GET_WEATHER_HANDLE);
    });
});
