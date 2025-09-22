<script lang="ts">
    import { assert } from '$lib/utils';
    import List from '$ui/pika/list/list.svelte';
    import PopupHelp from '$ui/pika/popup-help/popup-help.svelte';
    import { Checkbox } from '$ui/shadcn/checkbox';
    import { Input } from '$ui/shadcn/input';
    import { Label } from '$ui/shadcn/label';
    import type { SuggestionsFeature } from 'pika-shared/types/chatbot/chatbot-types';

    interface Props {
        overriddenFeature: SuggestionsFeature | undefined;
        originalFeature: SuggestionsFeature | undefined;
        isOverrideMode: boolean;
        isOverridden: boolean;
        chatAppId: string;
        featureEnabled: boolean;
        disabled: boolean;
    }

    let {
        overriddenFeature = $bindable(),
        originalFeature,
        isOverrideMode,
        isOverridden,
        chatAppId,
        featureEnabled,
        disabled,
    }: Props = $props();

    let validErrors = $derived.by(() => {
        const mode = isOverrideMode;
        const ovFeature = overriddenFeature;
        const orFeature = originalFeature;
        const feature = mode ? ovFeature : orFeature;

        if (feature && feature.enabled && (!feature.suggestions || feature.suggestions.length === 0)) {
            return ['No suggestions configured.  Add a suggestion or disable the feature.'];
        }

        return [];
    });

    let featureToShow = $derived(isOverrideMode ? overriddenFeature : originalFeature);

    function ensureFeature(): SuggestionsFeature {
        if (!isOverrideMode) {
            throw new Error('SuggestionsFeatureRenderer is not in override mode');
        }

        if (!overriddenFeature) {
            overriddenFeature = {
                featureId: 'suggestions',
                enabled: originalFeature?.enabled ?? false,
                suggestions: [],
                maxToShow: 5,
                randomize: false,
                randomizeAfter: 0,
                ...originalFeature,
            } as SuggestionsFeature;
        } else {
            if (!overriddenFeature.suggestions) {
                overriddenFeature.suggestions = [];
            }
            if (!overriddenFeature.maxToShow) {
                overriddenFeature.maxToShow = 5;
            }
            if (!('randomize' in overriddenFeature)) {
                overriddenFeature.randomize = false;
            }
            if (!('randomizeAfter' in overriddenFeature)) {
                overriddenFeature.randomizeAfter = 0;
            }
        }

        return overriddenFeature;
    }

    $effect(() => {
        if (isOverrideMode) {
            ensureFeature();
        } else {
            overriddenFeature = undefined;
        }
    });

    function updateMaxToShow(value: string) {
        assert(isOverrideMode, 'isOverrideMode must be true');
        assert(overriddenFeature, 'overriddenFeature must be defined');
        const num = parseInt(value);
        if (!isNaN(num) && num > 0) {
            overriddenFeature.maxToShow = num;
        }
    }

    function updateRandomize(value: boolean) {
        assert(isOverrideMode, 'isOverrideMode must be true');
        assert(overriddenFeature, 'overriddenFeature must be defined');
        overriddenFeature.randomize = value;
    }

    function updateRandomizeAfter(value: string) {
        assert(isOverrideMode, 'isOverrideMode must be true');
        assert(overriddenFeature, 'overriddenFeature must be defined');
        const num = parseInt(value);
        if (!isNaN(num) && num >= 0) {
            overriddenFeature.randomizeAfter = num;
        }
    }
</script>

<div class="space-y-4">
    <div>
        <div class="space-y-4">
            {#if validErrors.length > 0}
                <div class="p-3 border border-red-200 bg-red-50 rounded text-sm text-red-800 mb-4">
                    {#each validErrors as error}
                        <div>{error}</div>
                    {/each}
                </div>
            {/if}
            <!-- Suggestions list -->
            <div>
                <Label class="text-sm font-medium mb-2">Suggestions</Label>
                <List
                    classes="w-[100%] h-[200px]"
                    items={featureToShow?.suggestions || []}
                    mapping={{
                        value: (item) => item,
                        label: (item) => item,
                    }}
                    allowSelection={true}
                    multiSelect={true}
                    emptyMessage={`No suggestions added.`}
                    disabled={!featureEnabled || !isOverrideMode || !overriddenFeature?.enabled || disabled}
                    addRemove={isOverrideMode
                        ? {
                              addValueInputPlaceholder: 'Enter a suggestion...',
                              triggerAddOnEnter: true,
                              addItem: (item) => {
                                  const feature = ensureFeature();
                                  if (!feature.suggestions.includes(item)) {
                                      feature.suggestions.push(item);
                                  }
                              },
                              removeItem: (item) => {
                                  const feature = ensureFeature();
                                  feature.suggestions = feature.suggestions.filter((r) => r !== item);
                              },
                              allowArbitraryValues: {
                                  popupInputPlaceholder: 'Enter a suggestion...',
                                  convertValueToType: (value) => value,
                              },
                          }
                        : undefined}
                />
            </div>

            <!-- Display settings -->
            <div class="space-y-5">
                <div>
                    <div class="flex items-center space-x-2">
                        <Label for="max-show">Max to Show</Label>
                        <PopupHelp popoverClasses="w-60">
                            <div class="text-xs text-muted-foreground">
                                Maximum number of suggestions to display. The rest will not be shown.
                            </div>
                        </PopupHelp>
                    </div>
                    <Input
                        id="max-show"
                        type="number"
                        min="1"
                        max="20"
                        bind:value={() => (featureToShow?.maxToShow || 5) as any, updateMaxToShow}
                        disabled={!featureEnabled || !isOverrideMode || !overriddenFeature?.enabled || disabled}
                        class="w-20"
                    />
                </div>

                <div class="flex items-center space-x-2">
                    <Checkbox
                        id="randomize"
                        bind:checked={() => featureToShow?.randomize || false, updateRandomize}
                        disabled={!featureEnabled || !isOverrideMode || !overriddenFeature?.enabled || disabled}
                    />
                    <Label for="randomize">Randomize suggestions</Label>
                    <PopupHelp popoverClasses="w-60">
                        <div class="text-xs text-muted-foreground">
                            Each time the user opens the chat app, the suggestions will be randomized so the user sees
                            different suggestions.
                        </div>
                    </PopupHelp>
                </div>

                {#if featureToShow?.randomize}
                    <div>
                        <div class="flex items-center">
                            <Label for="randomize-after">Randomize After</Label>
                            <PopupHelp popoverClasses="w-60">
                                <div class="text-xs text-muted-foreground">
                                    Number of fixed suggestions to show before randomizing. So, perhaps the first three
                                    in the list are common questions that you wish to appear every time. The remainder
                                    of the list then will show random suggestions up to the maximum number of
                                    suggestions to show.
                                </div>
                            </PopupHelp>
                        </div>
                        <Input
                            id="randomize-after"
                            type="number"
                            min="0"
                            bind:value={() => (featureToShow?.randomizeAfter || 0) as any, updateRandomizeAfter}
                            disabled={!featureEnabled || !isOverrideMode || !overriddenFeature?.enabled || disabled}
                            class="w-20"
                        />
                    </div>
                {/if}
            </div>
        </div>
    </div>

    {#if isOverridden && originalFeature}
        <div class="p-3 border border-blue-200 bg-blue-50 rounded text-sm text-blue-800">
            <div class="font-medium mb-1">Original Settings:</div>
            <div class="space-y-1">
                <div>Suggestions: {originalFeature.suggestions?.length || 0} configured</div>
                <div>Max to show: {originalFeature.maxToShow || 5}</div>
                <div>Randomize: {originalFeature.randomize ? 'Yes' : 'No'}</div>
                {#if originalFeature.randomize}
                    <div>Randomize after: {originalFeature.randomizeAfter || 0}</div>
                {/if}
            </div>
        </div>
    {/if}
</div>
