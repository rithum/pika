<script lang="ts">
    import type { SemanticDirectiveForCreateOrUpdate } from 'pika-shared/types/chatbot/chatbot-types';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import { Label } from 'pika-ux/shadcn/label';
    import AgentEntityFilter from './filters/agent-entity-filter.svelte';
    import AgentsFilter from './filters/agents-filter.svelte';
    import ChatAppsFilter from './filters/chatapps-filter.svelte';
    import EntityFilter from './filters/entity-filter.svelte';
    import ToolsFilter from './filters/tools-filter.svelte';

    interface Props {
        directive: SemanticDirectiveForCreateOrUpdate;
        onChange: () => void;
    }

    let { directive = $bindable(), onChange }: Props = $props();
</script>

<div class="space-y-2 w-full flex-1 flex flex-col">
    <div class="flex items-center gap-2">
        <Label for="scopeValue">Scope Value</Label>
        <PopupHelp popoverClasses="text-xs max-w-[400px] p-1">
            <p>
                The value of the scope this semantic directive is associated with. This is a string or an object
                depending on the value of scopeType. This is used to narrow down which semantic directives to give to
                the LLM to consider for inclusion in the prompt.
            </p>
        </PopupHelp>
    </div>
    {#if !directive.scopeType}
        <p class="text-sm text-muted-foreground">Select a scope type</p>
    {:else if directive.scopeType === 'chatapp'}
        <ChatAppsFilter mode="edit" bind:directive {onChange} />
    {:else if directive.scopeType === 'agent'}
        <AgentsFilter mode="edit" bind:directive {onChange} />
    {:else if directive.scopeType === 'entity'}
        <EntityFilter mode="edit" bind:directive {onChange} />
    {:else if directive.scopeType === 'tool'}
        <ToolsFilter mode="edit" bind:directive {onChange} />
    {:else if directive.scopeType === 'agent-entity'}
        <AgentEntityFilter mode="edit" bind:directive {onChange} />
    {/if}
</div>
