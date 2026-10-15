/// <reference types="jest" />

import type { ChatMessage } from 'pika-shared/types/chatbot/chatbot-types';
import { prependInstructionsWhenNeeded, sanitizeUserInstruction } from '../../src/lambda/converse/index';

const RETIRED_INSTRUCTION = 'You are a helpful example assistant.';

function message(text: string): ChatMessage {
    return { message: text } as ChatMessage;
}

describe('sanitizeUserInstruction', () => {
    it('preserves a user-authored instruction', () => {
        expect(sanitizeUserInstruction('Always respond in French.')).toBe('Always respond in French.');
    });

    it('trims surrounding whitespace', () => {
        expect(sanitizeUserInstruction('  Always respond in French.  ')).toBe('Always respond in French.');
    });

    it('treats undefined as absent', () => {
        expect(sanitizeUserInstruction(undefined)).toBeUndefined();
    });

    it('treats an empty string as absent', () => {
        expect(sanitizeUserInstruction('')).toBeUndefined();
    });

    it('treats a whitespace-only instruction as absent', () => {
        expect(sanitizeUserInstruction('   ')).toBeUndefined();
    });

    it('keeps every non-blank instruction when no legacy strings are given', () => {
        expect(sanitizeUserInstruction(RETIRED_INSTRUCTION)).toBe(RETIRED_INSTRUCTION);
    });

    it('strips an exact legacy string, including with surrounding whitespace', () => {
        expect(sanitizeUserInstruction(RETIRED_INSTRUCTION, [RETIRED_INSTRUCTION])).toBeUndefined();
        expect(sanitizeUserInstruction(`  ${RETIRED_INSTRUCTION}  `, [RETIRED_INSTRUCTION])).toBeUndefined();
    });

    it('is not fooled by a similar-but-different string', () => {
        expect(sanitizeUserInstruction('You are a helpful example assistant, mostly.', [RETIRED_INSTRUCTION])).toBe(
            'You are a helpful example assistant, mostly.'
        );
    });
});

describe('prependInstructionsWhenNeeded', () => {
    it('prepends an instruction to the first message, separated by a blank line', () => {
        const messages = [message('Hello'), message('World')];
        prependInstructionsWhenNeeded(messages, 'Always respond in French.');
        expect(messages[0].message).toBe('Always respond in French.\n\nHello');
        expect(messages[1].message).toBe('World');
    });

    it('leaves the message untouched when no instruction is given', () => {
        const messages = [message('Hello')];
        prependInstructionsWhenNeeded(messages, undefined);
        expect(messages[0].message).toBe('Hello');
    });

    it('leaves the message untouched for a whitespace-only instruction', () => {
        const messages = [message('Hello')];
        prependInstructionsWhenNeeded(messages, '   ');
        expect(messages[0].message).toBe('Hello');
    });

    it('is a no-op when there are no messages', () => {
        const messages: ChatMessage[] = [];
        expect(() => prependInstructionsWhenNeeded(messages, 'Always respond in French.')).not.toThrow();
        expect(messages).toEqual([]);
    });
});
