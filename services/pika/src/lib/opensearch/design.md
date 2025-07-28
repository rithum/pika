# OpenSearch Design Document

## queryForSessions Method Design

### Overview

The `queryForSessions` method will provide comprehensive search capabilities for ChatSession documents stored in OpenSearch. It follows the established patterns from the legacy conversation search methods but adapts to the new type system and session-specific requirements.

### Method Signature

```typescript
export async function queryForSessions<T extends RecordOrUndef = undefined>(searchRequest: SessionSearchRequest<T>): Promise<SessionSearchResult<T>>;
```

### Return Type

```typescript
interface SessionSearchResult<T extends RecordOrUndef = undefined> {
    sessions: ChatSession<T>[];
    scroll_id?: string; // For pagination using search_after
    total?: number; // Total matching documents (if track_total_hits is enabled)
}
```

### Query Building Strategy

#### 1. Base Query Structure

```typescript
const body: OsQuery = {
    query: {
        bool: {
            filter: [], // All term/terms/range filters go here
            must: [] // Text search queries go here
        }
    },
    sort: [],
    search_after: searchRequest.searchAfter,
    size: searchRequest.size ?? MAX_RESULTS,
    track_total_hits: true
};
```

#### 2. Filter Building by Parameter Type

##### Basic Field Matching (Exact Terms)

- **userId**: `{ term: { user_id: searchRequest.userId } }`
- **chatAppId**: `{ term: { chat_app_id: searchRequest.chatAppId } }`
- **sessionId**: `{ term: { session_id: searchRequest.sessionId } }`
- **flagged**: `{ term: { flagged: searchRequest.flagged } }` (only if explicitly provided)

##### Date Range Queries

- **createDate/endCreateDate**:
    ```typescript
    if (searchRequest.createDate) {
        const rangeFilter: any = { gte: searchRequest.createDate };
        if (searchRequest.endCreateDate) {
            rangeFilter.lte = searchRequest.endCreateDate;
        }
        filter.push({ range: { create_date: rangeFilter } });
    }
    ```
- **lastUpdate/endLastUpdate**: Similar pattern using `last_update` field

##### Custom User Data Filtering (Complex)

This is the most complex part due to case preservation requirements:

```typescript
if (searchRequest.customUserData && typeof searchRequest.customUserData === 'object') {
    Object.entries(searchRequest.customUserData).forEach(([key, value]) => {
        // Custom user data preserves original case (following the same pattern as ChatUser conversion)
        // Known SessionAttributes fields (firstName, lastName, userId, etc.) are converted to snake_case,
        // but custom data keys from the T generic spread remain as-is
        filter.push({ term: { [`session_attributes.${key}`]: value } });
    });
}
```

##### Text Search (titlePartial)

```typescript
if (searchRequest.titlePartial && searchRequest.titlePartial.trim().length > 0) {
    body.query.bool.must.push({
        wildcard: {
            title: `*${searchRequest.titlePartial.toLowerCase()}*`
        }
    });
}
```

##### Insights Filtering (Most Complex)

The insights filtering requires nested boolean queries:

```typescript
if (searchRequest.insights) {
    const insightsFilters: QueryDslQueryContainer[] = [];

    // hasInsights is required
    if (searchRequest.insights.hasInsights) {
        insightsFilters.push({ exists: { field: 'insights' } });
    } else {
        insightsFilters.push({ bool: { must_not: { exists: { field: 'insights' } } } });
    }

    // Score-based filters
    if (searchRequest.insights.goalAchievementScore) {
        const scoreFilter = buildScoreFilter('insights.scoring.scores.goal_achievement.score', searchRequest.insights.goalAchievementScore);
        insightsFilters.push(scoreFilter);
    }

    // Array-based categorical filters (OR logic within each category)
    if (searchRequest.insights.userSentiment?.length > 0) {
        insightsFilters.push({
            terms: { 'insights.scoring.assessments.user_sentiment': searchRequest.insights.userSentiment }
        });
    }

    // Combine all insights filters with AND logic
    if (insightsFilters.length > 0) {
        filter.push({
            bool: {
                filter: insightsFilters
            }
        });
    }
}
```

Helper function for score filtering:

```typescript
function buildScoreFilter(field: string, scoreParams: ScoreSearchParams): QueryDslQueryContainer {
    switch (scoreParams.operator) {
        case 'eq':
            return { term: { [field]: scoreParams.score } };
        case 'gte':
            return { range: { [field]: { gte: scoreParams.score } } };
        case 'lte':
            return { range: { [field]: { lte: scoreParams.score } } };
    }
}
```

#### 3. Sorting Strategy

```typescript
if (searchRequest.sortBy?.length > 0) {
    searchRequest.sortBy.forEach((sortField) => {
        const osFieldName = convertCamelToSnakeCase(sortField.field);
        body.sort.push({ [osFieldName]: sortField.order });
    });
} else {
    // Default sorting
    body.sort = [{ create_date: 'desc' }, { session_id: 'desc' }];
}

// Ensure sessionId is always included for consistent pagination
const hasSessionIdSort = body.sort.some((s) => typeof s === 'object' && 'session_id' in s);
if (!hasSessionIdSort) {
    body.sort.push({ session_id: 'desc' });
}
```

#### 4. Field Name Conversion

All search parameters need to be converted from camelCase to snake_case for OpenSearch:

- `userId` → `user_id`
- `chatAppId` → `chat_app_id`
- `sessionId` → `session_id`
- `createDate` → `create_date`
- `lastUpdate` → `last_update`
- etc.

**Exception**: Custom user data keys preserve their original case within `session_attributes.{originalKey}`

#### 5. Response Processing

```typescript
const sessions: ChatSession<T>[] = [];
let scrollId: string | undefined;

for (let i = 0; i < resp.body.hits.hits.length; i++) {
    const hit = resp.body.hits.hits[i];
    if (hit._source) {
        // Convert from snake_case OS format to camelCase application format
        const session = convertChatSessionToCamelFromSnakeCase<T>(hit._source);
        sessions.push(session);
    }

    // Handle pagination for last item
    if (i === resp.body.hits.hits.length - 1 && hit.sort) {
        const morePages = resp.body.hits.hits.length === (searchRequest.size ?? MAX_RESULTS);
        if (morePages) {
            scrollId = buildScrollIdFromSort(hit.sort, body);
        }
    }
}

return {
    sessions,
    scroll_id: scrollId,
    total: getTotalValue(resp.body.hits.total)
};
```

### Type Conversion Strategy

#### OpenSearch Type Mappings

The new OpenSearch types follow the pattern `Types.Core_*` instead of the old naming convention:

- Old: `OSSearchResult<T>` → New: `Types.Search.Response<T>`
- Old: `BulkResponseItem` → New: `Types.Core_Bulk.ResponseItem`
- Old: `QueryDslBoolQuery` → New: `Types.Core_Search.BoolQuery`

#### Session Type Conversion

```typescript
interface ChatSessionOs {
    session_id: string;
    user_id: string;
    agent_alias_id: string;
    agent_id: string;
    chat_app_id: string;
    identity_id: string;
    title?: string;
    last_message_id?: string;
    session_attributes: {
        // Known SessionAttributes fields in snake_case
        first_name?: string;
        last_name?: string;
        timezone?: string;
        token?: string;
        user_id: string;
        chat_app_id: string;
        agent_id: string;
        current_date: string;
        // Plus any custom data fields (preserving their original case from T generic)
        [key: string]: any;
    };
    input_cost?: number;
    input_tokens?: number;
    output_cost?: number;
    output_tokens?: number;
    total_cost?: number;
    create_date: string;
    last_update: string;
    last_analyzed_message_id?: string;
    flagged?: boolean;
    insights?: SessionInsightsOs; // Snake case version of insights
    exp_date_unix_seconds?: number;
}
```

### Error Handling

Follow the established pattern:

1. Wrap OpenSearch calls in `execOpenSearchCmd`
2. Handle missing `_source` gracefully with logging
3. Validate required parameters before building query
4. Handle OpenSearch errors and convert to appropriate application errors

### Index Configuration

The method will search against the `session` index (or whatever the configured session index name is).

### Performance Considerations

1. Use `track_total_hits: true` only when total count is needed
2. Limit `size` parameter to reasonable maximums
3. Prefer `search_after` over `from/size` for deep pagination
4. Consider adding query caching for common search patterns
5. Use `_source` filtering if only specific fields are needed

### Additional Implementation Details

#### Complete Insights Filtering Implementation

All insights score fields that need to be handled:

- `goalAchievementScore` → `insights.scoring.scores.goal_achievement.score`
- `userSatisfactionScore` → `insights.scoring.scores.user_satisfaction.score`
- `aiPerformanceOverallScore` → `insights.scoring.scores.ai_performance.overall.score`
- `aiPerformanceAccuracyScore` → `insights.scoring.scores.ai_performance.accuracy.score`
- `aiPerformanceEfficiencyScore` → `insights.scoring.scores.ai_performance.efficiency.score`
- `interactionQualityScore` → `insights.scoring.scores.interaction_quality.score`

All insights categorical fields that need to be handled:

- `userSentiment` → `insights.scoring.assessments.user_sentiment`
- `goalCompletionStatus` → `insights.scoring.assessments.goal_completion_status`
- `satisfactionLevel` → `insights.scoring.assessments.satisfaction_level`
- `sessionDurationEstimate` → `insights.scoring.metrics.session_duration_estimate`
- `complexityLevel` → `insights.scoring.metrics.complexity_level`
- `userEffortRequired` → `insights.scoring.metrics.user_effort_required`
- `aiConfidenceLevel` → `insights.scoring.metrics.ai_confidence_level`

#### Required Helper Functions

**Session Conversion Functions** (following the pattern of existing ChatUser conversion functions):

**Important**: SessionAttributes contains two categories of fields:

1. **Known SessionAttributes fields** (`firstName`, `lastName`, `userId`, etc.) - converted to snake_case
2. **Custom user data** (from generic `T` spread via `SessionDataWithChatUserCustomDataSpreadIn<T>`) - preserves original case

```typescript
// Convert ChatSession to snake_case for OpenSearch storage
// Pattern follows convertChatUserToSnakeFromCamelCase but for sessionAttributes
function convertChatSessionToSnakeFromCamelCase<T>(session: ChatSession<T>): ChatSessionOs {
    const { sessionAttributes, ...sessionWithoutAttributes } = session;

    // Convert everything except sessionAttributes
    const converted = convertToSnakeCase<ChatSession<T>>(sessionWithoutAttributes);

    // Add sessionAttributes back with snake_case key but preserve custom data structure
    if (sessionAttributes !== undefined) {
        // Extract ALL known SessionAttributes fields (not just the ones I originally listed)
        const { firstName, lastName, timezone, token, userId, chatAppId, agentId, currentDate, ...customData } = sessionAttributes;

        // Convert known SessionAttributes fields to snake_case
        converted.session_attributes = {
            ...(firstName !== undefined && { first_name: firstName }),
            ...(lastName !== undefined && { last_name: lastName }),
            ...(timezone !== undefined && { timezone: timezone }), // Already snake_case
            ...(token !== undefined && { token: token }), // Already snake_case
            user_id: userId,
            chat_app_id: chatAppId,
            agent_id: agentId,
            current_date: currentDate,
            ...customData // Preserve custom data keys and values as-is (this is the T generic spread)
        };
    }

    return converted;
}

// Convert ChatSession from snake_case (from OpenSearch) to camelCase
// Pattern follows convertChatUserToCamelFromSnakeCase but for session_attributes
function convertChatSessionToCamelFromSnakeCase<T>(session: ChatSessionOs): ChatSession<T> {
    const { session_attributes, ...sessionWithoutAttributes } = session;

    // Convert everything except session_attributes
    const converted = convertToCamelCase<ChatSession<T>>(sessionWithoutAttributes);

    // Add sessionAttributes back with camelCase key but preserve custom data structure
    if (session_attributes !== undefined) {
        // Extract ALL known SessionAttributes fields from snake_case
        const { first_name, last_name, timezone, token, user_id, chat_app_id, agent_id, current_date, ...customData } = session_attributes;

        // Convert known fields back to camelCase, preserve custom data
        converted.sessionAttributes = {
            ...(first_name !== undefined && { firstName: first_name }),
            ...(last_name !== undefined && { lastName: last_name }),
            ...(timezone !== undefined && { timezone: timezone }), // Already camelCase
            ...(token !== undefined && { token: token }), // Already camelCase
            userId: user_id,
            chatAppId: chat_app_id,
            agentId: agent_id,
            currentDate: current_date,
            ...customData // Preserve custom data keys and values as-is (this is the T generic spread)
        } as SessionDataWithChatUserCustomDataSpreadIn<T>;
    }

    return converted as ChatSession<T>;
}
```

**Other Helper Functions**:

```typescript
// Build scroll ID for pagination
function buildScrollIdFromSort(sort: any[], query: OsQuery): string;

// Extract total value from OpenSearch response
function getTotalValue(total: SearchTotalHits | number): number;
```

**Note**: We can leverage the existing utility functions:

- `convertToSnakeCase<T>()` and `convertToCamelCase<T>()` from `utils.ts`
- Follow the same pattern as `convertChatUserToSnakeFromCamelCase` and `convertChatUserToCamelFromSnakeCase`

#### Validation Requirements

```typescript
// Validate that at least one date field is provided
if (!searchRequest.createDate && !searchRequest.lastUpdate) {
    throw new ValidationError('Either createDate or lastUpdate must be provided');
}

// Validate insights.hasInsights is provided if insights object exists
if (searchRequest.insights && searchRequest.insights.hasInsights === undefined) {
    throw new ValidationError('insights.hasInsights is required when insights filtering is requested');
}

// Validate score parameters
function validateScoreParams(scoreParams: ScoreSearchParams): void {
    if (scoreParams.score < 0 || scoreParams.score > 100) {
        throw new ValidationError('Score must be between 0 and 100');
    }
}
```

#### Index and Field Mapping Assumptions

- Index name: `session` (or from configuration)
- All date fields are stored as ISO 8601 strings
- Numeric fields (costs, tokens, scores) are stored as numbers
- Boolean fields are stored as booleans
- Custom user data is stored as nested object under `session_attributes`
- Insights data follows the nested structure as defined in the types

### Testing Strategy

1. Unit tests for query building logic
2. Integration tests with actual OpenSearch instance
3. Test edge cases like empty results, malformed queries
4. Test custom user data case preservation
5. Test complex insights filtering combinations
6. Test pagination scenarios
7. Test validation error scenarios
8. Performance tests with large result sets
