import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
    console.log('Custom callback handler triggered for:', url.pathname);
    
    // Extract all query parameters from the original callback
    const searchParams = url.searchParams;
    console.log('Received callback parameters:', {
        code: searchParams.get('code'),
        state: searchParams.get('state'),
        scope: searchParams.get('scope'),
        allParams: Object.fromEntries(searchParams.entries())
    });
    
    // Build the Auth.js callback URL with the provider suffix
    const authJsCallbackUrl = `/auth/callback/pika`;
    
    // Preserve all query parameters from the original callback
    const redirectUrl = new URL(authJsCallbackUrl, url.origin);
    searchParams.forEach((value, key) => {
        redirectUrl.searchParams.set(key, value);
    });
    
    console.log('Redirecting to Auth.js callback:', redirectUrl.toString());
    
    // Redirect to the Auth.js provider-specific callback
    throw redirect(302, redirectUrl.toString());
};