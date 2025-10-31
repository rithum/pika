import type { AppState } from '$lib/client/app/app.state.svelte';
import type { IdentityState } from '$lib/client/app/identity/identity.state.svelte';
import type { FetchZ } from '$lib/client/app/types';
import type { UserPrefsState } from '$lib/client/features/prefs/user-prefs.state.svelte';
import { checkClientResponse, CLIENT_RESOURCE_NAMES, handleClientError } from '$lib/client/util';
import type {
	ConverseInvocationMode,
	GetSessionAnalyticsAdminRequest,
	SessionAnalyticsResponse,
	ShowToastFn,
	UserType
} from 'pika-shared/types/chatbot/chatbot-types';

export class SessionAnalyticsState {
	#appState: AppState;
	#userPrefs: UserPrefsState;
	#identity: IdentityState;
	#showToast: ShowToastFn;

	// Reactive state for filters
	dateRange = $state<{ start: Date; end: Date }>({
		start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
		end: new Date()
	});
	selectedEntityId = $state<string | undefined>(undefined);
	selectedChatAppIds = $state<string[]>([]);
	selectedUserTypes = $state<UserType[]>(['external-user']);
	selectedInvocationModes = $state<(ConverseInvocationMode | 'undefined')[]>([
		'chat-app',
		'undefined'
	]);
	groupBy = $state<'day' | 'week' | 'month'>('day');

	// Analytics data and loading state
	analyticsData = $state<SessionAnalyticsResponse | undefined>(undefined);
	#isFetching = $state(false);
	error = $state<string | undefined>(undefined);

	// Derived state for entity feature
	entityFeatureEnabled = $derived.by(() => {
		return this.#appState.siteAdmin.siteFeatures?.entity?.enabled ?? false;
	});

	entityAttributeName = $derived.by(() => {
		return this.#appState.siteAdmin.siteFeatures?.entity?.attributeName ?? 'entity';
	});

	entityDisplayName = $derived.by(() => {
		return (
			this.#appState.siteAdmin.siteFeatures?.entity?.displayNameSingular ?? 'Entity'
		);
	});

	#loading = $derived.by(() => {
		if (this.#isFetching) {
			return 'Fetching analytics data...';
		}
		return undefined;
	});

	constructor(
		private readonly fetchz: FetchZ,
		appState: AppState,
		userPrefs: UserPrefsState,
		identity: IdentityState,
		showToast: ShowToastFn
	) {
		this.#appState = appState;
		this.#userPrefs = userPrefs;
		this.#identity = identity;
		this.#showToast = showToast;
	}

	get showToast() {
		return this.#showToast;
	}

	get loading() {
		return this.#loading;
	}

	get isFetching() {
		return this.#isFetching;
	}

	// Helper to format date as yyyy-MM-dd
	private formatDateForOpenSearch(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	// Fetch analytics data with current filters
	async fetchAnalytics() {
		if (this.#isFetching) {
			return;
		}

		this.#isFetching = true;
		this.error = undefined;

		try {
			const request: GetSessionAnalyticsAdminRequest = {
				command: 'getSessionAnalytics',
				analyticsRequest: {
					dateRange: {
						start: this.formatDateForOpenSearch(this.dateRange.start),
						end: this.formatDateForOpenSearch(this.dateRange.end)
					},
					entityId: this.selectedEntityId,
					entityAttributeName: this.entityFeatureEnabled
						? this.entityAttributeName
						: undefined,
					chatAppIds:
						this.selectedChatAppIds.length > 0 ? this.selectedChatAppIds : undefined,
					userTypes: this.selectedUserTypes.length > 0 ? this.selectedUserTypes : undefined,
					invocationModes:
						this.selectedInvocationModes.length > 0
							? this.selectedInvocationModes
							: undefined,
					groupBy: this.groupBy,
					limit: 10
				}
			};

			const response = await this.fetchz('/api/site-admin', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(request)
			});

		checkClientResponse(response, 'fetch analytics', this.#showToast, CLIENT_RESOURCE_NAMES.SESSION_ANALYTICS);
		const data: SessionAnalyticsResponse = await response.json();
		this.analyticsData = data;
		
		// Enrich entity names if entity feature is enabled and we have top entities
		if (this.entityFeatureEnabled && data.topEntities && data.topEntities.length > 0) {
			await this.enrichEntityNames();
		}
	} catch (err) {
		handleClientError(err, 'fetch analytics', this.#showToast);
		this.error = err instanceof Error ? err.message : 'Failed to fetch analytics data';
		} finally {
			this.#isFetching = false;
		}
	}

	// Enrich entity names by calling the batch API
	private async enrichEntityNames() {
		if (!this.analyticsData?.topEntities) return;

		try {
			const entityIds = this.analyticsData.topEntities.map((e) => e.entityId);

			const response = await this.fetchz('/api/site-admin', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					command: 'getValuesForEntityList',
					entityIds
				})
			});

			checkClientResponse(response, 'enrich entity names', this.#showToast, CLIENT_RESOURCE_NAMES.SESSION_ANALYTICS);
			const result: { success: boolean; data?: { value: string; label?: string }[] } = await response.json();

			if (result.data) {
				// Create a map of entity ID to entity name
				const entityNameMap = new Map(
					result.data.map((e) => [e.value, e.label ?? e.value])
				);

				// Enrich the entity names in topEntities
				this.analyticsData = {
					...this.analyticsData,
					topEntities: this.analyticsData.topEntities!.map((entity) => ({
						...entity,
						entityName: entityNameMap.get(entity.entityId) ?? entity.entityId
					}))
				};
			}
		} catch (err) {
			// If enrichment fails, log but continue with unenriched data
			console.error('Failed to enrich entity names:', err);
		}
	}

	// Set date range and refetch
	setDateRange(start: Date, end: Date) {
		this.dateRange = { start, end };
		this.fetchAnalytics();
	}

	// Set quick date range presets
	setQuickDateRange(range: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all') {
		const now = new Date();
		const start = new Date();

		switch (range) {
			case 'day':
				start.setDate(now.getDate() - 1);
				break;
			case 'week':
				start.setDate(now.getDate() - 7);
				break;
			case 'month':
				start.setMonth(now.getMonth() - 1);
				break;
			case 'quarter':
				start.setMonth(now.getMonth() - 3);
				break;
			case 'year':
				start.setFullYear(now.getFullYear() - 1);
				break;
			case 'all':
				start.setFullYear(2020, 0, 1); // Start from Jan 1, 2020
				break;
		}

		this.setDateRange(start, now);
	}

	// Set entity filter and refetch
	setEntity(entityId?: string) {
		this.selectedEntityId = entityId;
		this.fetchAnalytics();
	}

	// Set chat app filter and refetch
	setChatApps(chatAppIds: string[]) {
		this.selectedChatAppIds = chatAppIds;
		this.fetchAnalytics();
	}

	// Set user types and refetch
	setUserTypes(types: UserType[]) {
		this.selectedUserTypes = types;
		this.fetchAnalytics();
	}

	// Toggle a user type and refetch
	toggleUserType(type: UserType) {
		const index = this.selectedUserTypes.indexOf(type);
		if (index > -1) {
			this.selectedUserTypes.splice(index, 1);
		} else {
			this.selectedUserTypes.push(type);
		}
		this.fetchAnalytics();
	}

	// Set invocation modes and refetch
	setInvocationModes(modes: (ConverseInvocationMode | 'undefined')[]) {
		this.selectedInvocationModes = modes;
		this.fetchAnalytics();
	}

	// Toggle an invocation mode and refetch
	toggleInvocationMode(mode: ConverseInvocationMode | 'undefined') {
		const index = this.selectedInvocationModes.indexOf(mode);
		if (index > -1) {
			this.selectedInvocationModes.splice(index, 1);
		} else {
			this.selectedInvocationModes.push(mode);
		}
		this.fetchAnalytics();
	}

	// Set groupBy and refetch
	setGroupBy(groupBy: 'day' | 'week' | 'month') {
		this.groupBy = groupBy;
		this.fetchAnalytics();
	}

	// Initial data fetch
	async refreshData() {
		await this.fetchAnalytics();
	}
}