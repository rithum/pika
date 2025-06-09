import { initAuth, getAuthHandlers } from '$lib/server/auth2';
import { appConfig } from '$lib/server/config';
import { addSecurityHeaders } from '$lib/server/utils';
import { type Handle, type ServerInit } from '@sveltejs/kit';

// Initialize server configuration
export const init: ServerInit = async () => {
    console.log('Server initializing...');
    await appConfig.init();
    console.log('Server configuration initialized');
    
    // Initialize auth after config is ready
    initAuth();
    console.log('Auth initialization completed');
};

export const handle: Handle = async ({ event, resolve }) => {
    console.log('Request received:', {
        method: event.request.method,
        url: event.url.pathname,
        origin: event.url.origin,
    });

    // Handle Chrome DevTools protocol for local development
    if (appConfig.isLocal && event.url.pathname.startsWith('/.well-known/appspecific/com.chrome.devtools')) {
        console.log('DevTools request detected (local dev)');
        return new Response('OK', { status: 200 });
    }

    // Health check endpoint - accessible without authentication
    if (event.url.pathname === '/health' || event.url.pathname === '/health/') {
        console.log('Health check request');
        return new Response('OK', { 
            status: 200,
            headers: {
                'Content-Type': 'text/plain'
            }
        });
    }

    // Set appConfig in locals for server-side use
    event.locals.appConfig = appConfig;
    
    // Get the auth handle from initialized handlers
    const { handle: authHandle } = getAuthHandlers();
    
    // Run Auth.js handle first
    const response = await authHandle({ event, resolve });
    
    // Add security headers
    return addSecurityHeaders(response);
};