import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { appConfig } from './config';


interface ApiGatewayRequestParams {
    apiId: string;
    path: string; // e.g., "api/chat/user/123"
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'; // Add more if needed
    queryParams?: Record<string, string>;
    body?: any; // For POST, PUT, PATCH
    headers?: Record<string, string>;
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
export async function invokeApi<T = any>(
    params: ApiGatewayRequestParams,
): Promise<ApiGatewayResponse<T>> {
    const { apiId, path, method = 'GET', queryParams, body, headers: customHeaders = {} } = params;

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
            ...customHeaders, // Include any custom headers provided by the caller
        } as Record<string, string>,
        body: body ? JSON.stringify(body) : undefined,
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
        sha256: Sha256, // Pass the Sha256 class constructor
    });

    // 4. Sign the request
    // The sign method returns a Promise<HttpRequest>
    const signedRequest = (await signer.sign(requestToSign as any) as unknown) as {
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
            body: signedRequest.body,
        });
        response = await fetch(fetchRequest);
    } catch (error) {
        console.error('Fetch request failed:', error);
        throw new Error(`Network error or failed to fetch from API Gateway: ${error instanceof Error ? error.message + ' ' + error.stack : String(error)}`);
    }

    // 6. Process the response
    const responseBodyText = await response.text();
    let responseBodyJson: T;

    if (response.status === 404) {
        // return a 404
        return {
            statusCode: 404,
            body: {error: 'Not Found'} as T,
            headers: new Headers(),
        }
    } else if (response.status >= 400) {
        throw new Error(`API Gateway request failed with status ${response.status}. Response body: ${responseBodyText}`);
    }

    try {
        responseBodyJson = responseBodyText ? JSON.parse(responseBodyText) : ({} as T);
    } catch (e) {
        const error = e as Error;
        throw new Error(
            `Failed to parse API Gateway response as JSON. Status: ${response.status}, URL: ${invokeUrl.toString()}, Raw response: ${responseBodyText}, Parse error: ${error.message}`
        );
    }

    if (!response.ok) {
        console.error(`API Gateway request failed with status ${response.status}:`, responseBodyJson);
        throw new Error(
            `API Gateway request failed with status ${response.status}. Response body: ${JSON.stringify(responseBodyJson, null, 2)}`
        );
    }

    return {
        statusCode: response.status,
        body: responseBodyJson,
        headers: response.headers,
    };
}

// async function main() {
//     // Let's test the invokeApi function
//     const response = await invokeApi({
//         apiId: 'vsscyn28w0',
//         stage: 'dev',
//         region: 'us-east-1',
//         path: 'dev/api/chat/user/123',
//         method: 'GET',
//     });

//     if (response.ok) {
//         console.log(`worked: ${JSON.stringify(response.body, null, 2)}`);
//     } else {
//         console.log(`failed: ${JSON.stringify(response.body, null, 2)}`);
//         console.log(response.statusCode);
//     }
// }

// (async () => {
//     try {
//         await main();
//     } catch (error) {
//         console.error(error);
//     }
// })();