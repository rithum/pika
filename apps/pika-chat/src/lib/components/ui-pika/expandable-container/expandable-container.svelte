<!--
Expandable Container Component

A versatile container component that can be expanded/collapsed and supports different use cases.

Supported Use Cases:
1. Default Use Case
   - Basic expandable container with title and content
   - Can be expanded/collapsed via chevron button
   - Supports disabled state

2. Steps in Process Use Case
   - Visualizes steps in a multi-step process
   - Shows status indicators for each step:
     - Green checkmark (✓) for completed steps
     - Blue circle (○) for current active step
     - Yellow dash (-) for future steps
   - Requires stepsInProcess prop with:
     - stepId: Current step identifier
     - steps: Array of steps with their completion status


3. Button Use Case
   - A button that can be used to expand/collapse the container
   - The button is a chevron with a title that can be used to expand/collapse the container
   - The button is a ghost button

Props:
- forceExpanded: boolean (optional) - Forces container to stay expanded
- title: string - Title text for the container
- disabled: boolean (optional) - Disables interaction with content
- children: Snippet - Content to display when expanded
- useCase: 'steps-in-process' | 'default' | 'button' - Determines component behavior
- stepsInProcess: StepsInProcess<any> - Required for 'steps-in-process' use case
-->

<script lang="ts">
    import { Check, ChevronRight, Minus, Circle, ArrowBigRight } from '$icons/lucide';
    import { Button } from '$lib/components/ui/button';
    import type { Snippet } from 'svelte';

    type UseCase = 'steps-in-process' | 'default' | 'button';

    export interface StepModel<T> {
        // The ID of the step
        stepId: T;

        // Whether the step has been completed
        done: boolean;
    }

    export interface StepsInProcess<T> {
        // The ID of the current step this expandable container is representing
        stepId: T;

        // The steps that make up the process, in order
        steps: StepModel<T>[];
    }

    interface Props {
        forceExpanded?: boolean;
        title: string;
        disabled?: boolean;
        children?: Snippet<[]>;
        useCase?: UseCase;
        stepsInProcess?: StepsInProcess<any>;
    }

    let {
        forceExpanded = false,
        title,
        disabled = false,
        children,
        useCase = 'default',
        stepsInProcess,
    }: Props = $props();

    let expanded = $state(false);

    let statusObj = $derived.by(() => {
        if (useCase === 'steps-in-process' && stepsInProcess) {
            const currentStep = stepsInProcess.steps.find((step) => step.stepId === stepsInProcess.stepId);
            const firstStepNotDone = stepsInProcess.steps.find((step) => !step.done);
            if (currentStep?.done) {
                // This step is done
                return { iconColor: 'text-green-600', textColor: 'text-gray-600', icon: Check, titleIcon: undefined };
            } else if (firstStepNotDone?.stepId === currentStep?.stepId) {
                // This is the first step that hasn't been done
                return {
                    iconColor: 'text-purple-600',
                    textColor: 'text-gray-600',
                    icon: Circle,
                    titleIcon: ArrowBigRight,
                };
            } else {
                // You can't do this step yet since it's after the current step
                return { iconColor: 'text-yellow-600', textColor: 'text-gray-400', icon: Minus, titleIcon: undefined };
            }
        }

        return undefined;
    });

    let forceExpandedComputed = $derived.by(() => {
        if (useCase === 'steps-in-process' && stepsInProcess) {
            const currentStep = stepsInProcess.steps.find((step) => step.stepId === stepsInProcess.stepId);
            const firstStepNotDone = stepsInProcess.steps.find((step) => !step.done);
            return currentStep?.stepId === firstStepNotDone?.stepId;
        }
        return forceExpanded;
    });

    $effect(() => {
        const uc = useCase;
        const sip = stepsInProcess;
        if (uc === 'steps-in-process' && !sip) {
            throw new Error('stepsInProcess is required for useCase "steps-in-process"');
        }
    });
</script>

{#if useCase === 'button'}
    <Button variant="ghost" onclick={() => (expanded = !expanded)}>
        <span class="font-medium">{title}</span>
        <ChevronRight
            class="transition-transform duration-200 data-[state=open]:rotate-90"
            data-state={expanded || forceExpandedComputed ? 'open' : 'closed'}
        />
    </Button>
    {#if expanded || forceExpandedComputed}
        <div class="p-4 {disabled ? 'opacity-60 pointer-events-none' : ''}">
            {@render children?.()}
        </div>
    {/if}
{:else}
    <div
        class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
        data-state={expanded || forceExpandedComputed ? 'open' : 'closed'}
    >
        <div class="flex items-center p-1 gap-3 pl-2 pr-2">
            <div class="flex-grow flex items-center gap-1 {forceExpandedComputed ? 'h-8 pl-1' : ''}">
                {#if !forceExpandedComputed}
                    <Button variant="ghost" class="p-1" onclick={() => (expanded = !expanded)}>
                        <ChevronRight
                            class="transition-transform duration-200 data-[state=open]:rotate-90"
                            data-state={expanded || forceExpandedComputed ? 'open' : 'closed'}
                        />
                    </Button>
                {:else if useCase === 'steps-in-process' && statusObj && statusObj.titleIcon}
                    <statusObj.titleIcon class="w-5 h-5 {statusObj.iconColor}" />
                {/if}

                <span class="font-medium {statusObj ? statusObj.textColor : ''}">{title}</span>
            </div>

            {#if useCase === 'steps-in-process' && statusObj}
                <statusObj.icon class="w-5 h-5 {statusObj.iconColor}" />
            {/if}
        </div>

        {#if expanded || forceExpandedComputed}
            <div class="border-t border-gray-200 p-4 {disabled ? 'opacity-60 pointer-events-none' : ''}">
                {@render children?.()}
            </div>
        {/if}
    </div>
{/if}
