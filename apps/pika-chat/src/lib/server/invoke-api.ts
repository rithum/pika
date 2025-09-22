import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { SignatureV4 } from '@smithy/signature-v4';
import { error } from '@sveltejs/kit';
import { appConfig } from './config';
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

    const baseUrl = `https://${apiId}.execute-api.${appConfig.awsRegion}.amazonaws.com/${appConfig.stage}`;
    let fullPath = `/${path.startsWith('/') ? path.substring(1) : path}`;

    if (queryParams) {
        const searchParams = new URLSearchParams(queryParams);
        const queryString = searchParams.toString();
        if (queryString) {
            fullPath += `?${queryString}`;
        }
    }
    const invokeUrl = new URL(fullPath, baseUrl);

    // 2. Prepare the request object for signing
    // The SignatureV4 class expects an object that adheres to the HttpRequest interface
    const requestToSign = {
        method: method,
        hostname: invokeUrl.hostname,
        path: invokeUrl.pathname + invokeUrl.search,
        protocol: invokeUrl.protocol,
        headers: {
            Host: invokeUrl.hostname, // Host header is crucial for SigV4
            ...customHeaders // Include any custom headers provided by the caller
        } as Record<string, string>,
        body: body ? JSON.stringify(body) : undefined
    };

    // Add Content-Type for requests with a body, if not already set
    if (body && !requestToSign.headers['Content-Type'] && !requestToSign.headers['content-type']) {
        requestToSign.headers['Content-Type'] = 'application/json';
    }

    // 3. Create a SignatureV4 signer instance
    const signer = new SignatureV4({
        credentials: defaultProvider(), // Uses the default credential provider chain
        region: appConfig.awsRegion,
        service: 'execute-api',
        sha256: Sha256 // Pass the Sha256 class constructor
    });

    // 4. Sign the request
    // The sign method returns a Promise<HttpRequest>
    const signedRequest = (await signer.sign(requestToSign as any)) as unknown as {
        method: string;
        headers: Record<string, string>;
        body?: string;
    };

    // 5. Make the fetch call using the signed request details
    let response;
    try {
        // Create a new Request object for fetch using the signed details
        const fetchRequest = new Request(invokeUrl.toString(), {
            method: signedRequest.method,
            headers: signedRequest.headers,
            body: signedRequest.body
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
