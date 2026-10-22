import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { SignatureV4 } from '@smithy/signature-v4';
import { error } from '@sveltejs/kit';
import { resolveApiRoute } from '$lib/custom/local-api-route';
import { appConfig } from './config';
import { isDeployedRuntime } from './local-runtime-guard';
import { checkApiGatewayResponse } from './utils';

interface ApiGatewayRequestParams {
    apiId: string;
    path: string; // e.g., "api/chat/user/123"
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'; // Add more if needed
    queryParams?: Record<string, string>;
    body?: any; // For POST, PUT, PATCH
    headers?: Record<string, string>;
    errorInfo: {
        operation: string;
        resourceName: string;
        userId?: string;
    };
}

interface ApiGatewayResponse<T = any> {
    statusCode: number;
    body: T;
    headers: Headers;
}

/**
 * Calls an IAM-authorized API Gateway endpoint using fetch with SigV4 signing.
 * @param params Parameters for the API Gateway request.
 * @returns Promise<ApiGatewayResponse>
 */
export async function invokeApi<T = any>(params: ApiGatewayRequestParams): Promise<ApiGatewayResponse<T>> {
    const { apiId, path, method = 'GET', queryParams, body, headers: customHeaders = {}, errorInfo = { operation: 'operation', resourceName: 'resource' } } = params;

    const deployedBaseUrl = `https://${apiId}.execute-api.${appConfig.awsRegion}.amazonaws.com/${appConfig.stage}`;
    let fullPath = `/${path.startsWith('/') ? path.substring(1) : path}`;

    if (queryParams) {
        const searchParams = new URLSearchParams(queryParams);
        const queryString = searchParams.toString();
        if (queryString) {
            fullPath += `?${queryString}`;
        }
    }
    const route = resolveApiRoute(
        appConfig.isLocal && !isDeployedRuntime(),
        deployedBaseUrl,
        fullPath,
        appConfig.getArbitraryConfigValueNotRequired('LOCAL_CHAT_API_BASE_URL')
    );
    const invokeUrl = route.url;

    const request = {
        method: method,
        headers: { ...customHeaders } as Record<string, string>,
        body: body ? JSON.stringify(body) : undefined
    };

    if (body && !request.headers['Content-Type'] && !request.headers['content-type']) {
        request.headers['Content-Type'] = 'application/json';
    }

    let requestToSend: {
        method: string;
        headers: Record<string, string>;
        body?: string;
    };
    if (route.sign) {
        const signer = new SignatureV4({
            credentials: defaultProvider(),
            region: appConfig.awsRegion,
            service: 'execute-api',
            sha256: Sha256
        });
        requestToSend = (await signer.sign({
            ...request,
            hostname: invokeUrl.hostname,
            path: invokeUrl.pathname + invokeUrl.search,
            protocol: invokeUrl.protocol,
            headers: {
                Host: invokeUrl.hostname,
                ...request.headers
            }
        } as any)) as unknown as typeof requestToSend;
    } else {
        requestToSend = request;
    }

    let response;
    try {
        const fetchRequest = new Request(invokeUrl.toString(), {
            method: requestToSend.method,
            headers: requestToSend.headers,
            body: requestToSend.body
        });
        response = await fetch(fetchRequest);
    } catch (error) {
        console.error('Fetch request failed:', error);
        throw new Error(`Network error or failed to fetch from API Gateway: ${error instanceof Error ? error.message + ' ' + error.stack : String(error)}`);
    }

    // 6. Process the response
    const responseBodyText = await response.text();
    let responseBodyJson: T;
    let jsonParseError: unknown | undefined;

    try {
        responseBodyJson = responseBodyText ? JSON.parse(responseBodyText) : ({} as T);
    } catch (e) {
        // Let it fall through to the next block that checks for a returned http error from the API invocation.
        responseBodyJson = undefined as T;
        jsonParseError = e;
    }

    const apiGatewayResponse = {
        statusCode: response.status,
        body: responseBodyJson,
        headers: response.headers
    };

    // Perform automatic error checking if requested
    checkApiGatewayResponse(apiGatewayResponse, errorInfo.operation, errorInfo.resourceName, errorInfo.userId);

    // If checkApiGatewayResponse didn't throw an http error and we got an unknown error in the JSON parse block, throw an error.
    if (!!jsonParseError) {
        throw error(
            400,
            `Failed to parse API Gateway response as JSON. Status: ${response.status}, URL: ${invokeUrl.toString()}, Raw response: ${responseBodyText}, Parse error: ${jsonParseError instanceof Error ? jsonParseError.message : String(jsonParseError)}`
        );
    }

    if (!responseBodyJson || !(responseBodyJson as any).success) {
        console.error(`${errorInfo.operation} API Gateway body error:`, {
            body: responseBodyJson,
            statusCode: response.status,
            ...(errorInfo.userId && { userId: errorInfo.userId })
        });
        throw new Error(`API Gateway body error: ${(responseBodyJson as any)?.error || 'Unknown error'}`);
    }

    return apiGatewayResponse;
}
