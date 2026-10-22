export interface LocalConverseRoute {
    functionUrl: string;
    invokeInProcess: boolean;
}

/**
 * Chooses where invokeConverseFunctionUrl sends a converse request when running locally. Default: the configured URL, run in-process when local.
 */
export function resolveLocalConverseRoute(isLocal: boolean, configuredUrl: string, localOverride?: string): LocalConverseRoute {
    if (!isLocal || !localOverride) {
        return {
            functionUrl: configuredUrl,
            invokeInProcess: isLocal
        };
    }

    return {
        functionUrl: localOverride,
        invokeInProcess: false
    };
}
