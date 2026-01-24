<svelte:options customElement={{ tag: 'weather-alerts', shadow: 'none' }} />

<script lang="ts">
    import type { IWidgetMetadataAPI, PikaWCContext } from 'pika-shared/types/chatbot/webcomp-types';
    import type { InvokeAgentAsComponentOptions, ContextSourceDef } from 'pika-shared/types/chatbot/chatbot-types';
    import { getPikaContext } from 'pika-shared/util/wc-utils';
    import { getIconSvg } from 'pika-shared/util/icon-utils';
    import Spinner from 'pika-ux/shadcn/spinner/spinner.svelte';
    import OctagonAlert from '$icons/lucide/octagon-alert';
    import OctagonX from '$icons/lucide/octagon-x';
    import Eye from '$icons/lucide/eye';
    import CircleAlert from '$icons/lucide/circle-alert';

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

    const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours (once a day)

    let alerts: DisplayAlert[] = $state([]);
    let loading = $state(false);
    let error = $state('');
    let initialized = $state(false);
    let context = $state<PikaWCContext>() as PikaWCContext;
    let lastRefreshTime = $state<string | undefined>();
    let widgetMetadataApi = $state<IWidgetMetadataAPI | undefined>();
    let thinkingStatus = $state('');
    let toolStatus = $state('');

    $effect(() => {
        if (!initialized) {
            init();
        }
    });

    $effect(() => {
        if (widgetMetadataApi) {
            widgetMetadataApi.updateAction('check', {
                disabled: loading
            });
        }
    });

    async function init() {
        context = await getPikaContext($host());
        initialized = true;

        // Register widget metadata
        widgetMetadataApi = context.chatAppState.getWidgetMetadataAPI('weather', 'weather-alerts', context.instanceId, context.renderingContext);

        widgetMetadataApi.setMetadata({
            title: 'Weather Alerts',
            iconSvg: await getIconSvg('triangle-alert', 'lucide'),
            iconColor: '#dc2626', // Bright red
            actions: [
                {
                    id: 'check',
                    title: 'Check Alerts',
                    iconSvg: await getIconSvg('refresh-ccw', 'lucide'),
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
            applyAlertsData(cachedData.response);

            // Check if data is stale (older than 24 hours)
            const cacheAge = Date.now() - new Date(cachedData.timestamp).getTime();
            if (cacheAge > REFRESH_INTERVAL_MS) {
                // Auto-refresh stale data (once a day)
                await checkAlerts();
            } else {
                // Cached data is fresh - notify system that context is available
                if (context && context.instanceId) {
                    context.chatAppState.updateWidgetContext(context.instanceId);
                }
            }
        } else {
            // No cached data, fetch immediately (auto-load)
            await checkAlerts();
        }
    }

    function applyAlertsData(response: WeatherAlertsResponse) {
        const allAlerts: DisplayAlert[] = [];
        if (response?.locations && Array.isArray(response.locations)) {
            for (const locAlerts of response.locations) {
                if (locAlerts?.alerts && Array.isArray(locAlerts.alerts)) {
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
            }
        }
        alerts = allAlerts;
    }

    async function checkAlerts() {
        if (!context || loading) return;

        loading = true;
        error = '';
        thinkingStatus = '';
        toolStatus = '';

        try {
            const options: InvokeAgentAsComponentOptions = {
                source: 'component',
                onThinking: (text: string) => {
                    // Skip semantic-directives messages
                    if (text.startsWith('{"type":"semantic-directives"')) return;
                    thinkingStatus = text.length > 70 ? text.substring(0, 70) + '...' : text;
                },
                onToolCall: (call: { name: string; params: any }) => {
                    const funcName = call.name.split('__')[1] || call.name;
                    toolStatus = `Calling AI tool: ${funcName}...`;
                }
            };

            const response = await context.chatAppState.invokeAgentAsComponent<WeatherAlertsResponse>(
                'weather',
                'weather-alerts',
                'checkAlerts',
                'Check weather alerts for San Francisco, New York, Chicago, Los Angeles, Salt Lake City, Houston, and Miami',
                options
            );

            // Save to component values
            const timestamp = new Date().toISOString();
            const userWidgetData = context.chatAppState.getUserWidgetDataStoreState('weather', 'weather-alerts');
            await userWidgetData.setValue('alertsData', {
                response,
                timestamp
            } as CachedAlertsData);
            lastRefreshTime = timestamp;

            applyAlertsData(response);

            // Notify system that context has changed
            if (context && context.instanceId) {
                context.chatAppState.updateWidgetContext(context.instanceId);
            }

            thinkingStatus = '';
            toolStatus = '';
        } catch (e) {
            console.error('Error checking alerts:', e);
            error = 'Failed to check alerts';
        } finally {
            loading = false;
        }
    }

    function getSeverityColor(severity: string): { bg: string; text: string; border: string } {
        const sev = severity.toLowerCase();
        if (sev.includes('severe')) return { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' };
        if (sev.includes('warning')) return { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' };
        if (sev.includes('watch')) return { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' };
        if (sev.includes('advisory')) return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' };
        return { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' };
    }

    function getSeverity(severity: string): 'severe' | 'warning' | 'watch' | 'advisory' {
        const sev = severity.toLowerCase();
        if (sev.includes('severe')) return 'severe';
        if (sev.includes('warning')) return 'warning';
        if (sev.includes('watch')) return 'watch';
        if (sev.includes('advisory')) return 'advisory';
        return 'advisory';
    }

    /**
     * Provide context about active weather alerts.
     * NOT added automatically - user must manually add this sensitive alert information.
     * This ensures users explicitly choose to share alert data with AI.
     */
    export function getContextForLlm(): ContextSourceDef[] | undefined {
        // Only provide context if we have alerts
        if (!alerts || alerts.length === 0) {
            return undefined;
        }

        return [
            {
                sourceId: 'weather-alerts-active',
                llmInclusionDescription: 'Active weather alerts and warnings including severity, type, description, and affected locations',
                origin: 'auto',
                lucideIconName: 'triangle-alert',
                title: 'Weather Alerts',
                description: `${alerts.length} active ${alerts.length === 1 ? 'alert' : 'alerts'}`,
                data: {
                    alerts: alerts.map((a) => ({
                        severity: a.severity,
                        title: a.title,
                        location: a.location,
                        description: a.description,
                        issuedAt: a.issuedAt,
                        expiresAt: a.expiresAt
                    })),
                    checkedAt: lastRefreshTime
                },
                addAutomatically: false, // User must explicitly add alert context
                maxAgeMs: 60 * 60 * 1000 // 1 hour - alerts can change quickly
            }
        ];
    }
</script>

<div class="h-full w-full flex flex-col">
    {#if loading}
        <div class="px-3 py-3 space-y-2">
            <div class="flex items-center justify-center gap-2 text-gray-600 text-sm">
                <Spinner class="h-3.5 w-3.5 text-blue-500" />
                <span>Checking for alerts...</span>
            </div>
            {#if thinkingStatus}
                <div class="space-y-1.5 text-xs text-gray-500 pt-2">
                    <p class="font-bold">AI Reasoning</p>
                    <p class="text-indigo-600 italic">{thinkingStatus}</p>
                </div>
            {/if}
            {#if toolStatus}
                <div class="space-y-1.5 text-xs text-gray-500 pt-2">
                    <p class="font-bold">AI Tooling</p>
                    <p class="text-emerald-600 italic">{toolStatus}</p>
                </div>
            {/if}
        </div>
    {:else if error}
        <p class="text-center p-6 text-red-500 text-sm">{error}</p>
    {:else if alerts.length === 0}
        <div class="flex-1 flex items-center justify-center px-4">
            <div class="text-center">
                <div class="text-5xl mb-2">✅</div>
                <p class="text-sm font-medium text-green-600">All Clear</p>
                <p class="text-xs text-gray-500 mt-1">No active weather alerts</p>
            </div>
        </div>
        {#if lastRefreshTime}
            <div class="px-3 pb-2 text-right w-full italic text-gray-400" style="font-size: 0.55rem;">
                Checked: {new Date(lastRefreshTime).toLocaleString()}
            </div>
        {/if}
    {:else}
        <div class="flex-1 overflow-auto px-3 py-3">
            <div class="space-y-2">
                <!-- {#each alerts as alert}
                    {@const colors = getSeverityColor(alert.severity)}
                    <div class="rounded-lg border-2 {colors.border} {colors.bg} p-3">
                        <div class="flex items-start gap-2 mb-2">
                            <span class="text-xl">{getSeverityIcon(alert.severity)}</span>
                            <div class="flex-1">
                                <div class="flex items-center gap-2 mb-1">
                                    <span class="text-xs font-bold {colors.text} uppercase">{alert.severity}</span>
                                    <span class="text-xs text-gray-500">•</span>
                                    <span class="text-xs text-gray-600">{alert.location}</span>
                                </div>
                                <h4 class="text-sm font-semibold text-gray-900 m-0">{alert.title}</h4>
                                <p class="text-xs text-gray-600 mt-1 m-0 line-clamp-2">{alert.description}</p>
                            </div>
                        </div>
                    </div>
                {/each} -->
                {#each alerts as alert}
                    {@const colors = getSeverityColor(alert.severity)}
                    {@const severityType = getSeverity(alert.severity)}
                    <div class="w-full rounded-md border {colors.border} {colors.bg} p-2">
                        <!-- Header Row -->
                        <div class="flex items-center justify-between mb-1">
                            <div class="flex items-center gap-1">
                                <!-- Icon inline with text -->
                                {#if severityType === 'severe'}
                                    <OctagonAlert class="w-4 h-4 {colors.text}" />
                                {:else if severityType === 'warning'}
                                    <OctagonX class="w-4 h-4 {colors.text}" />
                                {:else if severityType === 'watch'}
                                    <Eye class="w-4 h-4 {colors.text}" />
                                {:else}
                                    <CircleAlert class="w-4 h-4 {colors.text}" />
                                {/if}
                                <!-- <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <circle cx="12" cy="12" r="10" stroke-width="2" />
                                    <line x1="12" y1="16" x2="12" y2="12" stroke-width="2" />
                                    <circle cx="12" cy="8" r="1" stroke-width="2" />
                                </svg> -->
                                <span class="text-xs font-semibold text-blue-700 uppercase">{alert.severity}</span>
                            </div>
                            <span class="text-xs text-gray-600 truncate">{alert.location}</span>
                        </div>

                        <!-- Title -->
                        <div class="text-sm font-bold text-gray-900 truncate">{alert.title}</div>

                        <!-- Body Text -->
                        <p class="text-sm text-gray-700 line-clamp-2">
                            {alert.description}
                        </p>
                    </div>
                {/each}
            </div>
        </div>
        {#if lastRefreshTime}
            <div class="px-3 pb-2 text-right w-full italic text-gray-400" style="font-size: 0.55rem;">
                Checked: {new Date(lastRefreshTime).toLocaleString()}
            </div>
        {/if}
    {/if}
</div>
