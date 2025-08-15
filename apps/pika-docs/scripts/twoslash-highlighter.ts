import { createDefaultMapFromNodeModules } from '@typescript/vfs';
import ts from 'typescript';
import type { TwoslashOptions } from '@sveltepress/twoslash';
import fs from 'node:fs';
import path from 'node:path';

// Absolute path to the chatbot types in the monorepo
const CHATBOT_TYPES_ABS_PATH = path.resolve(__dirname, '../../../packages/shared/src/types/chatbot/chatbot-types.ts');

export async function createTwoslashOptions(): Promise<TwoslashOptions> {
    // 1) Build a TS virtual FS with std libs
    const fsMap = createDefaultMapFromNodeModules({
        target: ts.ScriptTarget.ES2022
    });

    // 2) Load your real types into the VFS under a virtual path
    const chatbotTypes = fs.readFileSync(CHATBOT_TYPES_ABS_PATH, 'utf-8');
    const VIRTUAL_CHATBOT_TYPES = '/virtual/@chatbot-types.ts';
    fsMap.set(VIRTUAL_CHATBOT_TYPES, chatbotTypes);

    // 3) Return Twoslash options to be consumed by SveltePress's built-in highlighter
    return {
        fsMap,
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.NodeNext,
            target: ts.ScriptTarget.ES2022,
            baseUrl: '/',
            paths: {
                '@chatbot-types': [VIRTUAL_CHATBOT_TYPES],
                'pika-shared/*': [path.resolve(__dirname, '../../../packages/shared/src/*')]
            },
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            types: ['@sveltepress/vite/types', '@sveltepress/theme-default/types', '@sveltepress/theme-default/components', '@sveltejs/kit']
        }
    };
}
