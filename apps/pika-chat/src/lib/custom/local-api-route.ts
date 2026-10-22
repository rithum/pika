const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export interface ApiRoute {
    url: URL;
    sign: boolean;
}

/**
 * Chooses where invokeApi sends a request. Deployed: the API Gateway URL, SigV4-signed. Local with LOCAL_CHAT_API_BASE_URL: that loopback URL, unsigned.
 */
export function resolveApiRoute(isLocal: boolean, deployedBaseUrl: string, path: string, localBaseUrl?: string): ApiRoute {
    if (!isLocal || !localBaseUrl) {
        return {
            url: new URL(path, deployedBaseUrl),
            sign: true
        };
    }

    const localUrl = new URL(localBaseUrl);
    if (!LOOPBACK_HOSTS.has(localUrl.hostname)) {
        throw new Error(`LOCAL_CHAT_API_BASE_URL must be loopback, got ${localUrl.hostname}`);
    }
    return {
        url: new URL(path, `${localUrl.toString().replace(/\/$/, '')}/`),
        sign: false
    };
}
