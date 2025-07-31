# Session Insights Page - Comprehensive Design Document

## 🎯 Goals

Create a world-class, professional session search and insights experience that allows users to:

- Search, filter, and sort chat sessions with sophisticated criteria
- Toggle between simple and advanced search modes
- View session insights and analytics
- Perform bulk operations on sessions
- Navigate seamlessly to session details and messages

## 🏗️ Overall Page Architecture

### Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Navigation Header (with right action buttons)               │
├─────────────────────────────────────────────────────────────┤
│ Search Controls Panel                                       │
│ ┌─ Simple Mode ─────────────────┐ ┌─ Advanced Toggle ─────┐ │
│ │ • Quick search box            │ │ • Simple/Advanced     │ │
│ │ • Date range picker           │ │ • Saved searches      │ │
│ │ • Basic filters               │ │ • Export options      │ │
│ └───────────────────────────────┘ └───────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Advanced Search Panel (collapsible)                        │
│ ┌─ Insights Filters ──┐ ┌─ Feedback Filters ─┐ ┌─ More ─┐  │
│ │ • Score ranges      │ │ • Severity levels   │ │ • Costs │  │
│ │ • Status filters    │ │ • Feedback types    │ │ • Tokens│  │
│ └─────────────────────┘ └─────────────────────┘ └───────┘  │
├─────────────────────────────────────────────────────────────┤
│ Results Summary & Quick Actions                             │
├─────────────────────────────────────────────────────────────┤
│ Enhanced Sessions Table (PikaTable)                        │
│ • Multi-select with bulk actions                           │
│ • Expandable rows for quick insights                       │
│ • Rich cell renderers                                      │
│ • Contextual actions menu                                  │
└─────────────────────────────────────────────────────────────┘
```

## 🔍 Search Interface Design

### Required shadcn-svelte Components

**To be installed before implementation:**

- `Calendar` - For date range selection
- `Date Picker` - Alternative date input method
- `Range Calendar` - For date range selection
- `Popover` - For dropdown panels and date pickers
- `Slider` - For score range inputs
- `Switch` - For boolean toggle filters
- `Tabs` - For organizing advanced filters
- `Badge` - For filter chips and status indicators
- `Card` - For search panel sections
- `Collapsible` - For advanced search panel
- `Separator` - For visual organization
- `Toggle Group` - For mutually exclusive options
- `Alert` - For search tips and error states

### Simple Search Mode

```typescript
interface SimpleSearchState {
    // Primary search
    globalQuery: string; // Searches across title, userId, sessionId

    // Essential filters
    dateRange: {
        start: Date | null;
        end: Date | null;
        preset?: 'today' | 'week' | 'month' | '3months' | 'custom';
    };

    // Quick status filters
    insightsStatus: 'all' | 'available' | 'processing' | 'pending';
    feedbackStatus: 'all' | 'none' | 'positive' | 'negative' | 'mixed';

    // Quick actions
    showMyFeedbackOnly: boolean;
    showHighCostOnly: boolean;
}
```

**Simple Mode UI Components:**

```svelte
<Card class="p-4 space-y-4">
    <!-- Global Search -->
    <div class="flex gap-2">
        <Input placeholder="Search sessions, users, titles..." bind:value={simpleSearch.globalQuery} class="flex-1" />
        <Button variant="outline" onclick={toggleAdvanced}>Advanced</Button>
    </div>

    <!-- Date Range Picker -->
    <div class="flex items-center gap-4">
        <Label>Date Range:</Label>
        <DateRangePicker bind:range={simpleSearch.dateRange} />
        <div class="flex gap-1">
            <Badge variant={datePreset === 'today' ? 'default' : 'outline'} onclick={() => setDatePreset('today')}
                >Today</Badge
            >
            <Badge variant={datePreset === 'week' ? 'default' : 'outline'} onclick={() => setDatePreset('week')}
                >Week</Badge
            >
            <Badge variant={datePreset === 'month' ? 'default' : 'outline'} onclick={() => setDatePreset('month')}
                >Month</Badge
            >
        </div>
    </div>

    <!-- Quick Filters -->
    <div class="flex gap-4">
        <Select bind:value={simpleSearch.insightsStatus}>
            <option value="all">All Insights</option>
            <option value="available">Has Insights</option>
            <option value="processing">Processing</option>
            <option value="pending">Pending</option>
        </Select>

        <Select bind:value={simpleSearch.feedbackStatus}>
            <option value="all">All Feedback</option>
            <option value="none">No Feedback</option>
            <option value="positive">Positive</option>
            <option value="negative">Negative</option>
        </Select>

        <div class="flex items-center gap-2">
            <Switch bind:checked={simpleSearch.showMyFeedbackOnly} />
            <Label>My Feedback Only</Label>
        </div>
    </div>
</Card>
```

### Advanced Search Mode

```typescript
interface AdvancedSearchState extends SimpleSearchState {
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
```

**Advanced Mode UI Components:**

```svelte
<Collapsible bind:open={showAdvanced}>
    <Card class="p-4">
        <Tabs defaultValue="insights" class="w-full">
            <TabsList class="grid w-full grid-cols-4">
                <TabsTrigger value="insights">Insights</TabsTrigger>
                <TabsTrigger value="feedback">Feedback</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
                <TabsTrigger value="custom">Custom Data</TabsTrigger>
            </TabsList>

            <TabsContent value="insights" class="space-y-4">
                <!-- Score Range Sliders -->
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <Label>Goal Achievement Score</Label>
                        <Slider
                            bind:value={advancedSearch.insightsFilters.goalScoreRange}
                            min={0}
                            max={10}
                            step={0.1}
                            range
                        />
                        <div class="text-sm text-muted-foreground">
                            {advancedSearch.insightsFilters.goalScoreRange[0]} -
                            {advancedSearch.insightsFilters.goalScoreRange[1]}
                        </div>
                    </div>

                    <div>
                        <Label>User Satisfaction Score</Label>
                        <Slider
                            bind:value={advancedSearch.insightsFilters.satisfactionScoreRange}
                            min={0}
                            max={10}
                            step={0.1}
                            range
                        />
                    </div>
                </div>

                <!-- Multi-select filters -->
                <div class="grid grid-cols-3 gap-4">
                    <div>
                        <Label>User Sentiment</Label>
                        <ToggleGroup bind:value={advancedSearch.insightsFilters.userSentiment} multiple>
                            <ToggleGroupItem value="positive">Positive</ToggleGroupItem>
                            <ToggleGroupItem value="neutral">Neutral</ToggleGroupItem>
                            <ToggleGroupItem value="negative">Negative</ToggleGroupItem>
                        </ToggleGroup>
                    </div>

                    <div>
                        <Label>Goal Completion</Label>
                        <ToggleGroup bind:value={advancedSearch.insightsFilters.goalCompletionStatus} multiple>
                            <ToggleGroupItem value="completed">Completed</ToggleGroupItem>
                            <ToggleGroupItem value="partial">Partial</ToggleGroupItem>
                            <ToggleGroupItem value="failed">Failed</ToggleGroupItem>
                        </ToggleGroup>
                    </div>

                    <div>
                        <Label>Complexity Level</Label>
                        <ToggleGroup bind:value={advancedSearch.insightsFilters.complexityLevel} multiple>
                            <ToggleGroupItem value="low">Low</ToggleGroupItem>
                            <ToggleGroupItem value="medium">Medium</ToggleGroupItem>
                            <ToggleGroupItem value="high">High</ToggleGroupItem>
                        </ToggleGroup>
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="feedback" class="space-y-4">
                <!-- Feedback-specific filters -->
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <Label>Feedback Severity</Label>
                        <ToggleGroup bind:value={advancedSearch.feedbackFilters.severities} multiple>
                            <ToggleGroupItem value="low">Low</ToggleGroupItem>
                            <ToggleGroupItem value="medium">Medium</ToggleGroupItem>
                            <ToggleGroupItem value="high">High</ToggleGroupItem>
                        </ToggleGroup>
                    </div>

                    <div>
                        <Label>Feedback Source</Label>
                        <div class="space-y-2">
                            <div class="flex items-center space-x-2">
                                <Switch bind:checked={advancedSearch.feedbackFilters.reportedByHuman} />
                                <Label>Reported by Human</Label>
                            </div>
                            <div class="flex items-center space-x-2">
                                <Switch bind:checked={advancedSearch.feedbackFilters.createdByCustomer} />
                                <Label>Created by Customer</Label>
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <Label>Feedback Created Date Range</Label>
                    <DateRangePicker bind:range={advancedSearch.feedbackFilters.createdDateRange} />
                </div>
            </TabsContent>

            <TabsContent value="performance" class="space-y-4">
                <!-- Token and cost range sliders -->
                <div class="grid grid-cols-3 gap-4">
                    <div>
                        <Label>Input Tokens</Label>
                        <Slider
                            bind:value={advancedSearch.performanceFilters.inputTokensRange}
                            min={0}
                            max={100000}
                            step={100}
                            range
                        />
                    </div>

                    <div>
                        <Label>Output Tokens</Label>
                        <Slider
                            bind:value={advancedSearch.performanceFilters.outputTokensRange}
                            min={0}
                            max={100000}
                            step={100}
                            range
                        />
                    </div>

                    <div>
                        <Label>Total Cost ($)</Label>
                        <Slider
                            bind:value={advancedSearch.performanceFilters.totalCostRange}
                            min={0}
                            max={10}
                            step={0.01}
                            range
                        />
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="custom" class="space-y-4">
                <!-- Dynamic custom data filters -->
                <Alert>
                    <Info class="h-4 w-4" />
                    <AlertTitle>Custom Data Filters</AlertTitle>
                    <AlertDescription>
                        Filter by custom session attributes. Available fields are determined by your session data.
                    </AlertDescription>
                </Alert>

                <div class="space-y-2">
                    {#each Object.entries(availableCustomFields) as [field, type]}
                        <div class="flex items-center gap-2">
                            <Label class="w-32">{field}:</Label>
                            {#if type === 'string'}
                                <Input
                                    placeholder="Filter by {field}"
                                    bind:value={advancedSearch.customDataFilters[field]}
                                />
                            {:else if type === 'select'}
                                <Combobox
                                    options={getCustomFieldOptions(field)}
                                    bind:value={advancedSearch.customDataFilters[field]}
                                />
                            {/if}
                        </div>
                    {/each}
                </div>
            </TabsContent>
        </Tabs>
    </Card>
</Collapsible>
```

## 📊 Enhanced Table Design

### New Column Features

```typescript
// Add these columns to the existing ones:

// Expandable Details Column
{
    id: 'expand',
    header: '',
    cell: ({ row }) => renderComponent(Button, {
        variant: 'ghost',
        size: 'sm',
        onclick: () => row.toggleExpanded(),
        children: row.getIsExpanded() ? ChevronDown : ChevronRight
    }),
    size: 40
},

// Enhanced Insights Column with Progress Bars
{
    id: 'insightsScores',
    header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Insights Scores' }),
    cell: ({ row }) => {
        const insights = row.original.insights;
        if (!insights) return '-';

        return renderComponent(InsightsScoreCell, {
            goalScore: insights.scoring?.scores?.goalAchievement?.score,
            satisfactionScore: insights.scoring?.scores?.userSatisfaction?.score,
            aiPerformanceScore: insights.scoring?.scores?.aiPerformanceOverall?.score
        });
    },
    size: 200
},

// Enhanced Feedback Column with Severity Indicators
{
    id: 'feedbackDetails',
    header: ({ column }) => renderComponent(TableColumnHeader, { column, title: 'Feedback Details' }),
    cell: ({ row }) => {
        const feedback = row.original.feedback || [];
        return renderComponent(FeedbackDetailsCell, { feedback });
    },
    size: 150
}
```

### Bulk Actions Enhancement

```svelte
<!-- Enhanced bulk actions toolbar -->
{#if selectedSessions.length > 0}
    <Card class="p-3 mb-4 bg-blue-50 border-blue-200">
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
                <span class="font-medium">{selectedSessions.length} sessions selected</span>
                <Separator orientation="vertical" class="h-4" />
                <div class="flex gap-2">
                    <Button variant="outline" size="sm" onclick={exportSelected}>
                        <Download class="w-4 h-4 mr-2" />
                        Export
                    </Button>
                    <Button variant="outline" size="sm" onclick={bulkAddFeedback}>
                        <MessageSquare class="w-4 h-4 mr-2" />
                        Add Feedback
                    </Button>
                    <Button variant="outline" size="sm" onclick={bulkArchive}>
                        <Archive class="w-4 h-4 mr-2" />
                        Archive
                    </Button>
                </div>
            </div>
            <Button variant="ghost" size="sm" onclick={clearSelection}>
                <X class="w-4 h-4" />
            </Button>
        </div>
    </Card>
{/if}
```

## 🎛️ Page Header Integration

### Right Header Actions

```svelte
{#snippet pageHeaderRightSnippet()}
    <div class="flex items-center gap-2">
        <!-- Search Presets -->
        <Popover>
            <PopoverTrigger asChild let:builder>
                <Button variant="outline" size="sm" builders={[builder]}>
                    <BookmarkIcon class="w-4 h-4 mr-2" />
                    Saved Searches
                </Button>
            </PopoverTrigger>
            <PopoverContent class="w-64">
                <div class="space-y-2">
                    <h4 class="font-medium">Saved Search Presets</h4>
                    <div class="space-y-1">
                        {#each savedSearches as search}
                            <Button
                                variant="ghost"
                                size="sm"
                                class="w-full justify-start"
                                onclick={() => loadSavedSearch(search)}
                            >
                                {search.name}
                            </Button>
                        {/each}
                    </div>
                    <Separator />
                    <Button variant="outline" size="sm" onclick={saveCurrentSearch}>
                        <Plus class="w-4 h-4 mr-2" />
                        Save Current
                    </Button>
                </div>
            </PopoverContent>
        </Popover>

        <!-- Export Options -->
        <Popover>
            <PopoverTrigger asChild let:builder>
                <Button variant="outline" size="sm" builders={[builder]}>
                    <Download class="w-4 h-4 mr-2" />
                    Export
                </Button>
            </PopoverTrigger>
            <PopoverContent class="w-48">
                <div class="space-y-2">
                    <Button variant="ghost" size="sm" onclick={() => exportData('csv')}>
                        <FileText class="w-4 h-4 mr-2" />
                        Export as CSV
                    </Button>
                    <Button variant="ghost" size="sm" onclick={() => exportData('xlsx')}>
                        <FileSpreadsheet class="w-4 h-4 mr-2" />
                        Export as Excel
                    </Button>
                    <Button variant="ghost" size="sm" onclick={() => exportData('json')}>
                        <FileCode class="w-4 h-4 mr-2" />
                        Export as JSON
                    </Button>
                </div>
            </PopoverContent>
        </Popover>

        <!-- Refresh -->
        <Button variant="outline" size="sm" onclick={refreshData} disabled={isLoading}>
            <RefreshCw class={cn('w-4 h-4', isLoading && 'animate-spin')} />
        </Button>

        <!-- Settings -->
        <Button variant="outline" size="sm" onclick={openSettings}>
            <Settings class="w-4 h-4" />
        </Button>
    </div>
{/snippet}
```

## 🔄 State Management Integration

### Enhanced State Interface

```typescript
// Add to SiteAdminState
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
        searchTimestamp: Date;
    };
}

interface SavedSearch {
    id: string;
    name: string;
    searchParams: SessionSearchRequest;
    createdAt: Date;
    createdBy: string;
}
```

### Search Request Mapping

```typescript
// Enhanced mapping from UI state to API request
function buildSessionSearchRequest(simpleSearch: SimpleSearchState, advancedSearch: AdvancedSearchState, mode: 'simple' | 'advanced'): SessionSearchRequest {
    const baseRequest: SessionSearchRequest = {
        // Global search
        titlePartial: simpleSearch.globalQuery,

        // Date range
        createDate: simpleSearch.dateRange.start?.toISOString(),
        endCreateDate: simpleSearch.dateRange.end?.toISOString(),

        // Basic insights filter
        insights:
            simpleSearch.insightsStatus !== 'all'
                ? {
                      hasInsights: simpleSearch.insightsStatus === 'available'
                  }
                : undefined,

        // Basic feedback filter
        feedbackSeverity: mapFeedbackStatusToSeverity(simpleSearch.feedbackStatus)
    };

    if (mode === 'advanced') {
        return {
            ...baseRequest,

            // Advanced insights filters
            insights: {
                hasInsights: true,
                goalAchievementScore: {
                    score: advancedSearch.insightsFilters.goalScoreRange[0],
                    operator: 'gte'
                },
                userSentiment: advancedSearch.insightsFilters.userSentiment,
                goalCompletionStatus: advancedSearch.insightsFilters.goalCompletionStatus,
                complexityLevel: advancedSearch.insightsFilters.complexityLevel
            },

            // Advanced feedback filters
            feedbackSeverity: advancedSearch.feedbackFilters.severities,
            feedbackReportedByHuman: advancedSearch.feedbackFilters.reportedByHuman,
            feedbackCreatedByCustomer: advancedSearch.feedbackFilters.createdByCustomer,
            feedbackCreatedSince: advancedSearch.feedbackFilters.createdDateRange.start?.toISOString(),
            feedbackCreatedBefore: advancedSearch.feedbackFilters.createdDateRange.end?.toISOString(),

            // Performance filters would need custom handling or API extensions

            // Custom data filters
            customUserData: advancedSearch.customDataFilters
        };
    }

    return baseRequest;
}
```

## 🎨 Custom Components to Create

### 1. DateRangePicker Component

```typescript
// DateRangePicker.svelte
interface DateRangePickerProps {
    range: { start: Date | null; end: Date | null };
    presets?: DateRangePreset[];
    placeholder?: string;
    disabled?: boolean;
}

interface DateRangePreset {
    label: string;
    value: 'today' | 'week' | 'month' | '3months' | 'custom';
    range: { start: Date; end: Date };
}
```

### 2. InsightsScoreCell Component

```typescript
// InsightsScoreCell.svelte
interface InsightsScoreCellProps {
    goalScore?: number;
    satisfactionScore?: number;
    aiPerformanceScore?: number;
    showLabels?: boolean;
    compact?: boolean;
}
```

### 3. FeedbackDetailsCell Component

```typescript
// FeedbackDetailsCell.svelte
interface FeedbackDetailsCellProps {
    feedback: ChatSessionFeedback[];
    maxDisplay?: number;
    showSeverityColors?: boolean;
}
```

### 4. SearchPresetManager Component

```typescript
// SearchPresetManager.svelte
interface SearchPresetManagerProps {
    savedSearches: SavedSearch[];
    currentSearch: SessionSearchRequest;
    onLoadSearch: (search: SavedSearch) => void;
    onSaveSearch: (name: string, search: SessionSearchRequest) => void;
    onDeleteSearch: (searchId: string) => void;
}
```

## 🚀 Implementation Priority

### Phase 1: Core Search Interface ⭐⭐⭐

- [ ] Install required shadcn-svelte components
- [ ] Build simple search mode UI
- [ ] Integrate with existing table
- [ ] Basic date range picker
- [ ] Simple filter integration

### Phase 2: Advanced Search ⭐⭐

- [ ] Advanced search panel with tabs
- [ ] Score range sliders
- [ ] Multi-select filter components
- [ ] Custom data filters (dynamic)
- [ ] Search preset save/load

### Phase 3: Enhanced Table Experience ⭐⭐

- [ ] Expandable row details
- [ ] Enhanced cell renderers
- [ ] Bulk selection and actions
- [ ] Export functionality

### Phase 4: Professional Polish ⭐

- [ ] Performance optimizations
- [ ] Keyboard shortcuts
- [ ] Accessibility improvements
- [ ] Advanced export options
- [ ] Search analytics

## 🎯 Mock Data for Development

Since some data sources are not yet available, here are mock data structures to use during development:

### Mock Custom Fields

```typescript
const mockAvailableCustomFields = {
    accountId: 'string',
    department: 'select',
    userRole: 'select',
    priority: 'select',
    region: 'select'
};

const mockCustomFieldOptions = {
    department: ['Engineering', 'Sales', 'Marketing', 'Support'],
    userRole: ['Admin', 'User', 'Manager', 'Guest'],
    priority: ['High', 'Medium', 'Low'],
    region: ['US', 'EU', 'APAC', 'Other']
};
```

### Mock Saved Searches

```typescript
const mockSavedSearches: SavedSearch[] = [
    {
        id: '1',
        name: 'High Cost Sessions',
        searchParams: {
            insights: { hasInsights: true }
            // Mock criteria for high cost
        },
        createdAt: new Date('2024-01-15'),
        createdBy: 'admin@example.com'
    },
    {
        id: '2',
        name: 'Negative Feedback',
        searchParams: {
            feedbackSeverity: ['high', 'medium']
        },
        createdAt: new Date('2024-01-10'),
        createdBy: 'manager@example.com'
    },
    {
        id: '3',
        name: 'Recent Low Scoring',
        searchParams: {
            createDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            insights: {
                hasInsights: true,
                goalAchievementScore: { score: 5, operator: 'lte' }
            }
        },
        createdAt: new Date('2024-01-08'),
        createdBy: 'analyst@example.com'
    }
];
```

This design provides a comprehensive, professional session search and insights experience that scales from simple to advanced use cases while maintaining excellent UX patterns and integrating seamlessly with the existing application architecture.
