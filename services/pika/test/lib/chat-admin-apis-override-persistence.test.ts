import { jest } from '@jest/globals';
import type { ChatApp, ChatAppOverride, UserChatAppRule } from 'pika-shared/types/chatbot/chatbot-types';

const getChatAppByIdMock = jest.fn<(id: string) => Promise<ChatApp | undefined>>();
const updateOverrideMock = jest.fn<(...args: unknown[]) => Promise<ChatAppOverride>>();
const createOverrideMock = jest.fn<(override: Record<string, unknown>) => Promise<unknown>>();

jest.mock('../../src/lib/chat-admin-ddb', () => ({
    getChatAppById: (id: string) => getChatAppByIdMock(id),
    updateChatAppOverrideToDdb: (...args: unknown[]) => updateOverrideMock(...args),
    createChatAppOverrideDdb: (override: Record<string, unknown>) => createOverrideMock(override)
}));

import { createOrUpdateChatAppOverride } from '../../src/lib/chat-admin-apis';

const RULES: UserChatAppRule[] = [{ userTypes: ['internal-user'], chatAppUserTypes: ['external-user'] }];
const GRANTS = ['000000001', '000000002'];

function chatApp(override?: Partial<ChatAppOverride>): ChatApp {
    return { chatAppId: 'app-1', override: override as ChatAppOverride } as ChatApp;
}

describe('createOrUpdateChatAppOverride persistence of additive access and home page rules', () => {
    beforeEach(() => {
        getChatAppByIdMock.mockReset();
        updateOverrideMock.mockReset();
        createOverrideMock.mockReset();
        updateOverrideMock.mockResolvedValue({} as ChatAppOverride);
        createOverrideMock.mockResolvedValue({});
    });

    it('passes additionalExternalAccessControl and homePageFilterRules to the update when they are new', async () => {
        getChatAppByIdMock.mockResolvedValue(chatApp({ enabled: true }));

        await createOrUpdateChatAppOverride(
            { userId: 'admin', override: { enabled: true, additionalExternalAccessControl: GRANTS, homePageFilterRules: RULES } } as never,
            'app-1'
        );

        expect(updateOverrideMock).toHaveBeenCalledTimes(1);
        const fieldsToUpdate = updateOverrideMock.mock.calls[0][3];
        expect(fieldsToUpdate).toEqual({ additionalExternalAccessControl: GRANTS, homePageFilterRules: RULES });
    });

    it('updates nothing when both fields are deep-equal to the stored override', async () => {
        getChatAppByIdMock.mockResolvedValue(chatApp({ enabled: true, additionalExternalAccessControl: [...GRANTS], homePageFilterRules: JSON.parse(JSON.stringify(RULES)) }));

        await createOrUpdateChatAppOverride(
            { userId: 'admin', override: { enabled: true, additionalExternalAccessControl: [...GRANTS].reverse(), homePageFilterRules: RULES } } as never,
            'app-1'
        );

        expect(updateOverrideMock).not.toHaveBeenCalled();
    });

    it('queues removal of homePageFilterRules when the request sends null', async () => {
        getChatAppByIdMock.mockResolvedValue(chatApp({ enabled: true, homePageFilterRules: RULES }));

        await createOrUpdateChatAppOverride({ userId: 'admin', override: { enabled: true, homePageFilterRules: null } } as never, 'app-1');

        expect(updateOverrideMock.mock.calls[0][4]).toEqual(['homePageFilterRules']);
    });

    it('writes both fields when the override is first created', async () => {
        getChatAppByIdMock.mockResolvedValue(chatApp());

        await createOrUpdateChatAppOverride(
            { userId: 'admin', override: { enabled: true, additionalExternalAccessControl: GRANTS, homePageFilterRules: RULES } } as never,
            'app-1'
        );

        expect(createOverrideMock).toHaveBeenCalledTimes(1);
        expect(createOverrideMock.mock.calls[0][0]).toMatchObject({ chatAppId: 'app-1:override', additionalExternalAccessControl: GRANTS, homePageFilterRules: RULES });
    });
});
