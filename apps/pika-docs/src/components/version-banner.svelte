<script lang="ts">
    interface Props {
        version?: string;
    }

    const { version = '0.0.0' }: Props = $props();

    const STORAGE_KEY = 'pika-version-info';
    const RELEASES_URL = '/platform/releases/#current-version';
    const NEW_BANNER_DURATION_MS = 60 * 60 * 1000; // 1 hour

    let hasSeenVersion = $state(false);
    let showNewBanner = $state(false);
    let isAnimating = $state(false);
    let mounted = $state(false);

    interface VersionInfo {
        version: string;
        firstSeenAt: number;
    }

    // Run on mount (client-side only)
    $effect(() => {
        if (typeof window === 'undefined' || mounted) return;
        mounted = true;

        const storedData = localStorage.getItem(STORAGE_KEY);
        let versionInfo: VersionInfo | null = null;

        try {
            versionInfo = storedData ? JSON.parse(storedData) : null;
        } catch {
            // Invalid data, treat as null
            versionInfo = null;
        }

        const now = Date.now();
        const isNewVersion = !versionInfo || versionInfo.version !== version;
        const isWithinNewBannerWindow = versionInfo && versionInfo.version === version && now - versionInfo.firstSeenAt < NEW_BANNER_DURATION_MS;

        if (isNewVersion) {
            // Brand new version! Show NEW banner and record timestamp
            showNewBanner = true;
            isAnimating = true;

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    version,
                    firstSeenAt: now
                })
            );

            // Stop animating after initial effect
            setTimeout(() => {
                isAnimating = false;
            }, 1000);
        } else if (isWithinNewBannerWindow) {
            // Same version, but within 1-hour window - keep showing NEW banner
            showNewBanner = true;
            isAnimating = false; // No animation on refresh
        } else {
            // Same version, but after 1-hour window - show subtle badge
            hasSeenVersion = true;
        }
    });
</script>

{#if mounted}
    <div class="version-banner-wrapper">
        {#if showNewBanner}
            <a href={RELEASES_URL} class="version-banner new" class:animating={isAnimating}>
                <span class="badge">NEW</span>
                <span class="text">Version {version} released</span>
                <svg class="arrow" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1 6h10M7 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
            </a>
        {:else if hasSeenVersion}
            <a href={RELEASES_URL} class="version-banner subtle">
                <span class="text">v{version}</span>
            </a>
        {/if}
    </div>
{/if}

<style>
    .version-banner-wrapper {
        display: contents;
    }

    .version-banner {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        padding: 0.5rem 0.875rem;
        border-radius: 0.5rem;
        text-decoration: none;
        transition: all 0.2s ease;
        font-size: 0.9375rem;
        white-space: nowrap;
        font-weight: 500;
    }

    .version-banner.new {
        background: var(--sl-color-accent);
        color: var(--sl-color-white);
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
    }

    .version-banner.new.animating {
        animation: slideIn 0.4s ease-out;
    }

    .version-banner.new:hover {
        filter: brightness(1.1);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    }

    .version-banner.subtle {
        background: transparent;
        color: var(--sl-color-gray-2);
        border: 1px solid var(--sl-color-gray-5);
        font-size: 0.8125rem;
        padding: 0.375rem 0.625rem;
        font-weight: 400;
    }

    .version-banner.subtle:hover {
        background: var(--sl-color-gray-6);
        border-color: var(--sl-color-gray-4);
    }

    .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0.25rem 0.5rem;
        background: rgba(255, 255, 255, 0.25);
        color: var(--sl-color-white);
        border-radius: 0.25rem;
        font-weight: 700;
        font-size: 0.6875rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }

    .text {
        line-height: 1.2;
        color: white;
    }

    .arrow {
        opacity: 0.9;
        transition: transform 0.2s ease;
        flex-shrink: 0;
        color: white;
    }

    .version-banner:hover .arrow {
        transform: translateX(2px);
        opacity: 1;
        color: white;
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(10px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    /* Light mode adjustments */
    @media (prefers-color-scheme: light) {
        .version-banner.new {
            box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
        }

        .version-banner.new:hover {
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        }

        .version-banner.subtle {
            background: transparent;
            color: var(--sl-color-gray-2);
            border-color: var(--sl-color-gray-5);
        }

        .version-banner.subtle:hover {
            background: var(--sl-color-gray-7);
        }
    }

    /* Responsive: hide text on small screens, keep badge */
    @media (max-width: 768px) {
        .version-banner.new .text {
            display: none;
        }

        .version-banner.new {
            padding: 0.5rem 0.625rem;
            gap: 0.375rem;
        }

        .version-banner.subtle {
            font-size: 0.75rem;
            padding: 0.375rem 0.5rem;
        }
    }
</style>
