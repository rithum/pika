# ChatSession Table Design - World-Class Experience

## 🎯 Goals

Create a sophisticated, enterprise-grade table experience for ChatSession data using PikaTable and TanStack, optimized for server-side operations and scalability.

## 🏗️ Architecture Overview

### Server-Side Integration Pattern

```typescript
// Enhanced state management for server-side operations
interface SessionTableState {
    // Client-side state
    localFilters: ColumnFiltersState;
    localSorting: SortingState;
    selection: RowSelectionState;

    // Server-side state
    serverRequest: SessionSearchRequest;
    isLoading: boolean;
    error?: string;
    totalCount: number;
    scrollId?: string;
}
```

### Key Features Implemented

#### ✅ **Column Design**

- **Selection**: Multi-row selection with checkboxes
- **Session ID**: Truncated display for long UUIDs
- **User Info**: User ID with global search capability
- **Session Title**: Fallback to "Untitled Session"
- **Timestamps**: Relative time formatting (e.g., "2 hours ago")
- **Token Usage**: Formatted with thousands separators
- **Cost**: Currency formatting with 4 decimal precision
- **Insights Status**: Badge-based visual indicators
- **Goal Score**: Color-coded badges (green/yellow/red)
- **Feedback Status**: Count and severity indicators
- **Row Actions**: Contextual dropdown menus

#### ✅ **Filtering & Search**

- **Global Search**: Across sessionId, userId, and title
- **Faceted Filters**: Insights status and feedback categories
- **Custom Filter Functions**: For complex data relationships

#### ✅ **Interactive Features**

- **Sorting**: All numeric and date columns
- **Column Management**: Show/hide with persistence
- **Pagination**: Configurable page sizes
- **Row Actions**: View, edit, archive, delete operations

## 🚀 Advanced Enhancements

### 1. **Server-Side Pagination & Filtering**

```typescript
// Enhanced table component with server integration
export class ServerPaginatedTable {
    private async fetchData(request: SessionSearchRequest) {
        this.isLoading = true;
        try {
            const response = await siteAdmin.searchSessions(request);
            this.sessions = response.sessions;
            this.totalCount = response.total;
            this.scrollId = response.scrollId;
        } finally {
            this.isLoading = false;
        }
    }

    // Debounced filter updates to prevent excessive API calls
    private debouncedFilterUpdate = debounce(this.updateServerFilters, 300);
}
```

### 2. **Advanced Filtering Integration**

```typescript
// Map client filters to server search params
function mapFiltersToServerRequest(filters: ColumnFiltersState, sorting: SortingState, globalFilter: string): SessionSearchRequest {
    return {
        // Global search across multiple fields
        titlePartial: globalFilter,

        // Insights filtering
        insights: filters.find((f) => f.id === 'insightsStatus')
            ? {
                  hasInsights: filters.some((f) => f.value.includes('available'))
              }
            : undefined,

        // Feedback filtering
        feedbackSeverity: filters.find((f) => f.id === 'feedbackStatus')?.value,

        // Date range filtering
        createDate: filters.find((f) => f.id === 'dateRange')?.value?.[0],
        endCreateDate: filters.find((f) => f.id === 'dateRange')?.value?.[1],

        // Sorting
        sortBy: sorting.map((s) => ({
            field: s.id as any,
            order: s.desc ? 'desc' : 'asc'
        }))
    };
}
```

### 3. **Performance Optimizations**

#### Virtual Scrolling for Large Datasets

```typescript
// PikaTable enhancement for virtual rows
import { useVirtualizer } from '@tanstack/react-virtual';

const virtualizedTable = createSvelteTable({
    ...baseConfig,
    getRowModel: () => virtualizer.getVirtualItems(),
    estimateSize: () => 50 // Row height estimate
});
```

#### Intelligent Caching

```typescript
// Cache frequently accessed data
const sessionCache = new Map<string, ChatSession>();
const queryCache = new Map<string, SessionSearchResponse>();

// Cache invalidation strategies
function invalidateSessionCache(sessionId: string) {
    sessionCache.delete(sessionId);
    // Invalidate related queries
    for (const [key] of queryCache) {
        if (key.includes(sessionId)) {
            queryCache.delete(key);
        }
    }
}
```

### 4. **Rich Data Visualization**

#### Custom Cell Renderers

```typescript
// Insights Score Cell with Progress Indicator
export function InsightsScoreCell({ score }: { score?: number }) {
    if (!score) return <span>-</span>;

    return (
        <div class="flex items-center gap-2">
            <div class="w-12 h-2 bg-gray-200 rounded-full">
                <div
                    class="h-full rounded-full transition-all"
                    class:bg-green-500={score >= 8}
                    class:bg-yellow-500={score >= 6 && score < 8}
                    class:bg-red-500={score < 6}
                    style="width: {score * 10}%"
                />
            </div>
            <span class="text-sm font-medium">{score}/10</span>
        </div>
    );
}

// Cost Trend Cell with Sparkline
export function CostTrendCell({ currentCost, historicalCosts }: {
    currentCost?: number;
    historicalCosts?: number[];
}) {
    return (
        <div class="flex items-center gap-2">
            <span>${currentCost?.toFixed(4) ?? '-'}</span>
            {historicalCosts && (
                <MiniSparkline data={historicalCosts} />
            )}
        </div>
    );
}
```

#### Expandable Row Details

```typescript
// Enhanced row expansion for session details
{
    id: 'expander',
    header: '',
    cell: ({ row }) => (
        <Button
            variant="ghost"
            size="sm"
            onclick={() => row.toggleExpanded()}
        >
            {row.getIsExpanded() ? <ChevronDown /> : <ChevronRight />}
        </Button>
    ),
    enableSorting: false,
    enableHiding: false,
}

// Expanded content component
export function SessionDetailsExpanded({ session }: { session: ChatSession }) {
    return (
        <div class="p-4 bg-gray-50 border-t">
            <div class="grid grid-cols-3 gap-4">
                <InsightsPanel insights={session.insights} />
                <FeedbackPanel feedback={session.feedback} />
                <MetricsPanel session={session} />
            </div>
        </div>
    );
}
```

### 5. **Advanced UX Features**

#### Bulk Operations

```typescript
// Bulk action toolbar
export function BulkActionsToolbar({ selectedRows }: { selectedRows: Row<ChatSession>[] }) {
    return (
        <div class="flex items-center gap-2 p-2 bg-blue-50 border rounded">
            <span>{selectedRows.length} sessions selected</span>
            <Button onclick={() => bulkArchive(selectedRows)}>Archive</Button>
            <Button onclick={() => bulkExport(selectedRows)}>Export</Button>
            <Button variant="destructive" onclick={() => bulkDelete(selectedRows)}>
                Delete
            </Button>
        </div>
    );
}
```

#### Smart Filters

```typescript
// Preset filter configurations
const filterPresets = {
    'High Cost Sessions': {
        totalCost: { score: 1.0, operator: 'gte' }
    },
    'Needs Attention': {
        insights: {
            hasInsights: true,
            goalAchievementScore: { score: 5, operator: 'lte' }
        }
    },
    'Recent Feedback': {
        feedbackCreatedSince: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    }
};
```

#### Column Templates

```typescript
// Reusable column templates for consistency
export const StandardColumns = {
    timestamp: (key: keyof ChatSession, title: string) => ({
        accessorKey: key,
        header: ({ column }) => PikaTableColumnHeader({ column, title }),
        cell: ({ getValue }) => formatDistanceToNow(new Date(getValue() as string), { addSuffix: true }),
        sortingFn: 'datetime'
    }),

    currency: (key: keyof ChatSession, title: string) => ({
        accessorKey: key,
        header: ({ column }) => PikaTableColumnHeader({ column, title }),
        cell: ({ getValue }) => {
            const value = getValue() as number | undefined;
            return value ? `$${value.toFixed(4)}` : '-';
        },
        meta: { align: 'right' }
    }),

    badge: (key: keyof ChatSession, title: string, variants: Record<string, string>) => ({
        accessorKey: key,
        header: ({ column }) => PikaTableColumnHeader({ column, title }),
        cell: ({ getValue }) => {
            const value = getValue() as string;
            return Badge({ variant: variants[value] || 'default', children: value });
        }
    })
};
```

## 🔧 Implementation Roadmap

### Phase 1: ✅ **Core Table (Completed)**

- [x] Basic column definitions
- [x] Sorting and filtering
- [x] Row actions
- [x] Faceted filters

### Phase 2: 🚧 **Server Integration (Next)**

- [ ] Server-side pagination
- [ ] Debounced filtering
- [ ] Loading states
- [ ] Error handling

### Phase 3: 📈 **Advanced Features**

- [ ] Virtual scrolling
- [ ] Bulk operations
- [ ] Export functionality
- [ ] Expandable rows

### Phase 4: 🎨 **UX Polish**

- [ ] Custom cell renderers
- [ ] Filter presets
- [ ] Keyboard shortcuts
- [ ] Accessibility improvements

## 🎛️ Configuration Examples

### Production-Ready Filter Setup

```typescript
const productionFacetedFilters: FacetedFilters = [
    {
        columnId: 'insightsStatus',
        title: 'Insights Status',
        options: [
            { label: 'Has Insights', value: 'available', icon: Check },
            { label: 'Processing', value: 'processing', icon: Clock },
            { label: 'Pending Analysis', value: 'pending', icon: AlertCircle },
            { label: 'Failed', value: 'failed', icon: XCircle }
        ]
    },
    {
        columnId: 'goalScore',
        title: 'Goal Achievement',
        options: [
            { label: 'Excellent (8-10)', value: 'excellent' },
            { label: 'Good (6-7)', value: 'good' },
            { label: 'Poor (0-5)', value: 'poor' }
        ]
    },
    {
        columnId: 'costTier',
        title: 'Cost Tier',
        options: [
            { label: 'High (>$1)', value: 'high' },
            { label: 'Medium ($0.10-$1)', value: 'medium' },
            { label: 'Low (<$0.10)', value: 'low' }
        ]
    }
];
```

This design provides a solid foundation for a world-class ChatSession table experience that can scale with your needs!
