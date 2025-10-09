<svelte:options customElement={{ tag: 'hello-world', shadow: 'none' }} />
<script lang="ts">
    import Counter from './counter.svelte';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { type PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    
    let initialized = $state(false);

    let context =$state<PikaWCContext>() as PikaWCContext;

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    async function init() {
        // $host() is svelte's way to get the host element of the web component
        const context = await getPikaContext($host());
        initialized = true;
        console.log(context.appState.identity.user.userId)

        try {
        const awsCredentials = await context.appState.identity.getUserAwsCredentials();
        const user = context.appState.identity.user;
        console.log(awsCredentials);
        console.log(user);
        } catch (error) {
            console.error(`Error getting AWS credentials: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    $inspect(context);
</script>

<main class="flex flex-col items-center justify-center h-screen make-me-green">
    <div class="card">
        <Counter />
    </div>
</main>