<script lang="ts">
    import { signOut } from '@auth/sveltekit/client';
    import { onMount } from 'svelte';

    onMount(async () => {
        console.log('Logout page mounted');
        console.log('Initiating Auth.js signOut...');

        try {
            // Automatically sign out when this page loads
            const result = await signOut({
                callbackUrl: '/auth/login',
                redirect: true,
            });
            console.log('SignOut completed:', result);
        } catch (err) {
            console.error('SignOut error:', err);
        }
    });
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
        <div class="text-center">
            <h2 class="mt-6 text-3xl font-extrabold text-gray-900">Signing out...</h2>
            <p class="mt-2 text-sm text-gray-600">You are being signed out of your account.</p>
        </div>
    </div>
</div>
