import type { ChatSession, SessionSearchDateType, SessionSearchRequest } from '@pika/shared/types/chatbot/chatbot-types';

export interface SimpleSearchState {
    // Primary search
    globalQuery: string; // Searches across title, userId, sessionId

    // Essential filters
    dateRange: {
        start: Date; // Required - defaults to one week ago, cannot be removed
        end: Date | null; // Optional - defaults to now if not provided
        preset?: 'today' | 'week' | 'month' | '3months' | 'custom';
    };

    // Date filter type (required - API validation enforces one must be provided)
    dateFilterType: SessionSearchDateType;

    // Quick status filters
    insightsStatus: 'all' | 'available' | 'processing' | 'pending';
    feedbackStatus: 'all' | 'none' | 'positive' | 'negative' | 'mixed';

    // Quick actions
    showMyFeedbackOnly: boolean;
    showHighCostOnly: boolean;
}

export interface AdvancedSearchState extends SimpleSearchState {
    // Detailed session filters
    specificUsers: string[];
    specificChatApps: string[];
    sessionIdPattern: string;

    // Insights advanced filters
    insightsFilters: {
        goalScoreRange: [number, number]; // 0-10 slider
        satisfactionScoreRange: [number, number];
        aiPerformanceScoreRange: [number, number];
        userSentiment: ('positive' | 'neutral' | 'negative')[];
        goalCompletionStatus: ('completed' | 'partial' | 'failed')[];
        complexityLevel: ('low' | 'medium' | 'high')[];
    };

    // Feedback advanced filters
    feedbackFilters: {
        severities: ('low' | 'medium' | 'high')[];
        types: ('bug' | 'feature' | 'complaint' | 'praise')[];
        reportedByHuman: boolean | null;
        createdByCustomer: boolean | null;
        internalCommentTypes: string[];
        createdDateRange: { start: Date | null; end: Date | null };
    };

    // Performance filters
    performanceFilters: {
        inputTokensRange: [number, number];
        outputTokensRange: [number, number];
        totalCostRange: [number, number];
        sessionDuration: ('short' | 'medium' | 'long')[];
    };

    // Custom user data filters (dynamic based on available fields)
    customDataFilters: Record<string, string>;
}

export interface SavedSearch {
    id: string;
    name: string;
    searchParams: SessionSearchRequest;
    createdAt: Date;
    createdBy: string;
}

interface SessionInsightsPageState {
    // Search state
    searchMode: 'simple' | 'advanced';
    simpleSearch: SimpleSearchState;
    advancedSearch: AdvancedSearchState;

    // UI state
    showAdvancedPanel: boolean;
    selectedSessions: string[];
    expandedRows: Set<string>;

    // Saved searches
    savedSearches: SavedSearch[];

    // Export/import state
    exportInProgress: boolean;
    exportFormat: 'csv' | 'xlsx' | 'json';

    // Performance state
    searchMetrics: {
        lastSearchDuration: number;
        totalResults: number;
        searchTimestamp: Date | null;
    };

    // Data state
    sessions: ChatSession[];
    isLoading: boolean;
    error: string | null;
    hasMore: boolean;
    scrollId?: string;
}
