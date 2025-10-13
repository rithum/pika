<svelte:options customElement="weather-alerts" />

<script lang="ts">
    import type { PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import Button from 'pika-ux/shadcn/button/button.svelte';
    import RefreshCw from '$icons/lucide/refresh-cw';
    import ChevronRight from '$icons/lucide/chevron-right';
    import TriangleAlert from '$icons/lucide/triangle-alert';

    interface WeatherAlert {
        severity: string;
        type: string;
        description: string;
        issuedAt: string;
        expiresAt: string;
    }

    interface LocationAlerts {
        location: string;
        alerts: WeatherAlert[];
    }

    interface WeatherAlertsResponse {
        locations: LocationAlerts[];
    }

    interface DisplayAlert {
        severity: string;
        title: string;
        location: string;
        description: string;
        issuedAt: string;
        expiresAt: string;
    }

    interface CachedAlertsData {
        response: WeatherAlertsResponse;
        timestamp: string;
    }

    const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

    let alerts: DisplayAlert[] = $state([]);
    let loading = $state(true);
    let error = $state('');
    let initialized = $state(false);
    let context = $state<PikaWCContext>() as PikaWCContext;
    let lastRefreshTime = $state<string>('');

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    async function init() {
        // $host() is svelte's way to get the host element of the web component
        context = await getPikaContext($host());
        initialized = true;

        // Register widget metadata
        const metadata = context.chatAppState.getWidgetMetadataAPI('weather', 'weather-alerts', context.instanceId, context.renderingContext);

        metadata.setMetadata({
            title: 'Weather Alerts',
            actions: [
                {
                    id: 'check',
                    title: 'Check Alerts',
                    // triangle-alert icon svg
                    iconSvg:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-triangle-alert-icon lucide-triangle-alert"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
                    callback: async () => {
                        await checkAlerts();
                    }
                }
            ]
        });

        // Load cached alerts data
        const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'weather-alerts');
        const cachedData = await userWidgetData.getValue<CachedAlertsData>('alertsData');

        if (cachedData) {
            lastRefreshTime = cachedData.timestamp;
            // Apply cached alerts
            const allAlerts: DisplayAlert[] = [];
            for (const locAlerts of cachedData.response.locations) {
                for (const alert of locAlerts.alerts) {
                    allAlerts.push({
                        severity: alert.severity,
                        title: alert.type,
                        location: locAlerts.location,
                        description: alert.description,
                        issuedAt: alert.issuedAt,
                        expiresAt: alert.expiresAt
                    });
                }
            }
            alerts = allAlerts;

            // Check if data is stale (older than 1 hour)
            const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
            if (cacheAge > REFRESH_INTERVAL_MS) {
                // Auto-refresh stale data
                await checkAlerts();
            }
        } else {
            // No cached data, fetch immediately
            await checkAlerts();
        }

        loading = false;
    }

    async function checkAlerts() {
        if (!context) return;

        loading = true;
        error = '';

        try {
            const response = await context.chatAppState.invokeAgentAsComponent<WeatherAlertsResponse>(
                'weather',
                'weather-alerts',
                'checkAlerts',
                'Check weather alerts for San Francisco, New York, and London'
            );

            // Save to component values
            const timestamp = new Date().toISOString();
            const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'weather-alerts');
            await userWidgetData.setValue('alertsData', {
                response,
                timestamp
            } as CachedAlertsData);
            lastRefreshTime = timestamp;

            // Flatten the alerts from all locations
            const allAlerts: DisplayAlert[] = [];
            for (const locAlerts of response.locations) {
                for (const alert of locAlerts.alerts) {
                    allAlerts.push({
                        severity: alert.severity,
                        title: alert.type,
                        location: locAlerts.location,
                        description: alert.description,
                        issuedAt: alert.issuedAt,
                        expiresAt: alert.expiresAt
                    });
                }
            }

            alerts = allAlerts;
        } catch (e) {
            console.error('Error checking alerts:', e);
            error = 'Failed to check alerts';
        } finally {
            loading = false;
        }
    }

    function getSeverityColor(severity: string) {
        const sev = severity.toLowerCase();
        if (sev.includes('severe')) return '#dc2626';
        if (sev.includes('warning')) return '#ef4444';
        if (sev.includes('watch')) return '#f59e0b';
        if (sev.includes('advisory')) return '#3b82f6';
        return '#6b7280';
    }

    async function viewDetails(alert: DisplayAlert) {
        // Open canvas with detailed alert info
        context.chatAppState.renderTag('weather.full-forecast', 'canvas', {
            alert: alert
        });
    }
</script>

<div class="weather-alerts">
    <div class="header">
        <div class="title-section">
            <h3 class="text-base font-semibold m-0">Weather Alerts</h3>
            {#if lastRefreshTime}
                <span class="last-update">Updated {new Date(lastRefreshTime).toLocaleTimeString()}</span>
            {/if}
        </div>
        <Button variant="outline" size="sm" onclick={checkAlerts} disabled={loading}>
            <RefreshCw class="h-3 w-3 mr-1" />
            {loading ? 'Checking...' : 'Check'}
        </Button>
    </div>

    {#if loading}
        <p class="loading">Checking for alerts...</p>
    {:else if error}
        <p class="error">{error}</p>
    {:else if alerts.length === 0}
        <p class="no-alerts">✓ No active alerts</p>
    {:else}
        <ul class="alerts-list">
            {#each alerts as alert}
                <li class="alert-item" style="border-left-color: {getSeverityColor(alert.severity)}">
                    <div class="alert-content">
                        <span class="severity" style="background-color: {getSeverityColor(alert.severity)}20; color: {getSeverityColor(alert.severity)}">
                            {alert.severity.toUpperCase()}
                        </span>
                        <h4>{alert.title}</h4>
                        <p class="location">{alert.location}</p>
                        <p class="description">{alert.description}</p>
                    </div>
                    <Button variant="ghost" size="sm" onclick={() => viewDetails(alert)}>
                        Details
                        <ChevronRight class="h-3 w-3 ml-1" />
                    </Button>
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .weather-alerts {
        padding: 0.75rem;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
    }

    .title-section {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
    }

    .last-update {
        font-size: 0.65rem;
        color: #6b7280;
    }

    .alerts-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .alert-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        border-left: 3px solid;
        background: #fef2f2;
        border-radius: 4px;
        margin-bottom: 0.5rem;
    }

    .alert-content h4 {
        margin: 0.25rem 0;
        font-size: 0.875rem;
        color: #111827;
        font-weight: 600;
    }

    .alert-content p {
        margin: 0.25rem 0 0 0;
        font-size: 0.75rem;
    }

    .alert-content .location {
        color: #6b7280;
        font-weight: 500;
    }

    .alert-content .description {
        color: #374151;
        margin-top: 0.5rem;
    }

    .severity {
        display: inline-block;
        font-size: 0.625rem;
        font-weight: bold;
        padding: 0.125rem 0.375rem;
        border-radius: 3px;
        margin-bottom: 0.375rem;
    }

    .loading,
    .no-alerts,
    .error {
        text-align: center;
        padding: 1.5rem;
        color: #6b7280;
        font-size: 0.875rem;
    }

    .no-alerts {
        color: #059669;
    }

    .error {
        color: #ef4444;
    }
</style>
