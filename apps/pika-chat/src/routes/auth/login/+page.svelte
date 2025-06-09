<script lang="ts">
    import { signIn } from '@auth/sveltekit/client';
    import { page } from '$app/stores';
    import { onMount } from 'svelte';

    // Get any error from the URL params
    let error = $derived($page.url.searchParams.get('error'));

    onMount(() => {
        console.log('Login page mounted');
        console.log('URL search params:', Object.fromEntries($page.url.searchParams.entries()));
        if (error) {
            console.error('Authentication error detected:', error);
        }
    });

    async function handleSignIn() {
        console.log('Sign-in button clicked');
        console.log('Initiating Auth.js signIn with provider: pika');

        try {
            const result = await signIn('pika');
            console.log('SignIn call completed:', result);
        } catch (err) {
            console.error('SignIn error:', err);
        }
    }
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
        <div>
            <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">Sign in to your account</h2>
            <p class="mt-2 text-center text-sm text-gray-600">Access the Pika chatbot with your company credentials</p>
        </div>

        {#if error}
            <div class="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded relative" role="alert">
                <strong class="font-bold">Authentication Error:</strong>
                <span class="block sm:inline">{error}</span>
            </div>
        {/if}

        <div>
            <button
                onclick={handleSignIn}
                class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
                Sign in with Pika Auth
            </button>
        </div>
    </div>
</div>
