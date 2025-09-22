import type { MockAuthData, MockCustomData } from '$lib/server/auth/default-provider';
import type { AuthenticatedUser } from 'pika-shared/types/chatbot/chatbot-types';

export const internalUserNoEntity: AuthenticatedUser<MockAuthData, MockCustomData> = {
    userId: 'internal-no-entity',
    firstName: 'Internal',
    lastName: 'User',
    userType: 'internal-user',
    authData: {
        mockAccessToken: 'aaa-bbb-ccc'
    },
    // Internal users typically don't have entity associations
    customData: {} as MockCustomData,
    features: {
        instruction: {
            type: 'instruction',
            instruction: ''
        },
        history: {
            type: 'history',
            history: true
        }
    },
    roles: ['pika:content-admin', 'pika:site-admin']
};

export const internalOverrideUserNoEntity: AuthenticatedUser<MockAuthData, MockCustomData> = {
    userId: 'internal-override-no-entity',
    firstName: 'Internal Override No Entity',
    lastName: 'Internal Override No Entity',
    userType: 'internal-user',
    authData: {
        mockAccessToken: 'aaa-bbb-ccc'
    },
    customData: {} as MockCustomData,
    overrideData: {
        weather: {
            accountId: 'acme-account',
            accountType: 'standard'
        }
    },
    features: {
        instruction: {
            type: 'instruction',
            instruction: ''
        },
        history: {
            type: 'history',
            history: true
        }
    },
    roles: ['pika:content-admin', 'pika:site-admin']
};

export const externalAcmeUser1: AuthenticatedUser<MockAuthData, MockCustomData> = {
    userId: 'external-acme-user-1',
    firstName: 'John',
    lastName: 'Acme',
    userType: 'external-user',
    authData: {
        mockAccessToken: 'aaa-bbb-ccc'
    },
    // This user belongs to the Acme account
    customData: {
        accountId: 'acme-account',
        accountType: 'standard'
    } as MockCustomData,
    overrideData: {
        weather: {
            accountId: 'acme-account',
            accountType: 'standard'
        }
    },
    features: {
        instruction: {
            type: 'instruction',
            instruction: ''
        },
        history: {
            type: 'history',
            history: true
        }
    }
};

export const externalAcmeUser2: AuthenticatedUser<MockAuthData, MockCustomData> = {
    userId: 'external-acme-user-2',
    firstName: 'Jane',
    lastName: 'Acme',
    userType: 'external-user',
    authData: {
        mockAccessToken: 'aaa-bbb-ccc'
    },
    // This user also belongs to the Acme account
    customData: {
        accountId: 'acme-account',
        accountType: 'standard'
    } as MockCustomData,
    overrideData: {
        weather: {
            accountId: 'acme-account',
            accountType: 'standard'
        }
    },
    features: {
        instruction: {
            type: 'instruction',
            instruction: ''
        },
        history: {
            type: 'history',
            history: true
        }
    }
};

export const externalStarkUser1: AuthenticatedUser<MockAuthData, MockCustomData> = {
    userId: 'external-stark-user-1',
    firstName: 'Tony',
    lastName: 'Stark',
    userType: 'external-user',
    authData: {
        mockAccessToken: 'aaa-bbb-ccc'
    },
    // This user belongs to the Stark account
    customData: {
        accountId: 'stark-account',
        accountType: 'premium'
    } as MockCustomData,
    overrideData: {
        weather: {
            accountId: 'stark-account',
            accountType: 'premium'
        }
    },
    features: {
        instruction: {
            type: 'instruction',
            instruction: ''
        },
        history: {
            type: 'history',
            history: true
        }
    }
};

export const externalWayneUser1: AuthenticatedUser<MockAuthData, MockCustomData> = {
    userId: 'external-wayne-user-1',
    firstName: 'Bruce',
    lastName: 'Wayne',
    userType: 'external-user',
    authData: {
        mockAccessToken: 'aaa-bbb-ccc'
    },
    // This user belongs to the Wayne account
    customData: {
        accountId: 'wayne-account',
        accountType: 'enterprise'
    } as MockCustomData,
    overrideData: {
        weather: {
            accountId: 'wayne-account',
            accountType: 'enterprise'
        }
    },
    features: {
        instruction: {
            type: 'instruction',
            instruction: ''
        },
        history: {
            type: 'history',
            history: true
        }
    }
};
