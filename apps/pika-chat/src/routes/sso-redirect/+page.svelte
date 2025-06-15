<script>
    import { onMount } from 'svelte';
    import { page } from '$app/stores';

    onMount(() => {
        console.log('SSO redirect page mounted, initiating OAuth...');

        // Get the callback URL from query parameters
        const callbackUrl = $page.url.searchParams.get('callbackUrl') || '/';
        console.log('Callback URL:', callbackUrl);

        // Create a form and submit it to initiate OAuth
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/auth/signin/pika';

        // Add CSRF token (we'll need to get this)
        // For now, let's try without it since it might be auto-added by Auth.js

        // Add callback URL
        const callbackInput = document.createElement('input');
        callbackInput.type = 'hidden';
        callbackInput.name = 'callbackUrl';
        callbackInput.value = callbackUrl;
        form.appendChild(callbackInput);

        // Add the form to the page and submit it
        document.body.appendChild(form);
        console.log('Submitting OAuth form to:', form.action);
        form.submit();
    });
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p class="mt-2 text-sm text-gray-600">Redirecting to sign-in...</p>
    </div>
</div>
