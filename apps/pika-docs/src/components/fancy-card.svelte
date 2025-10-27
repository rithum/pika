<script>
    export let title = '';
    export let bgColor = 'transparent';
</script>

<article class="fancy-card" style="background-color: {bgColor};">
    <p class="fancy-card-title">
        <span>{title}</span>
    </p>
    <div class="fancy-card-body">
        <slot />
    </div>
</article>

<style>
    .fancy-card {
        display: flex;
        flex-direction: column;
        border: 1px solid var(--sl-color-gray-6);
        border-radius: 0.5rem;
        padding: 1rem;
        gap: 0.5rem;
        margin: 1rem 0;
    }

    .fancy-card-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 600;
        font-size: 1.125rem;
        line-height: 1.5;
        margin: 0;
        color: var(--sl-color-white);
    }

    .fancy-card-title span {
        display: block;
    }

    .fancy-card-body {
        color: var(--sl-color-gray-2);
    }

    .fancy-card-body :global(p:first-child) {
        margin-top: 0;
    }

    .fancy-card-body :global(p:last-child) {
        margin-bottom: 0;
    }

    .fancy-card-body :global(img) {
        max-width: 100%;
        height: auto;
        border-radius: 0.25rem;
    }

    /* Zoom container support */
    .fancy-card-body :global(.zoom-container) {
        margin: 0.5rem 0;
    }
</style>
