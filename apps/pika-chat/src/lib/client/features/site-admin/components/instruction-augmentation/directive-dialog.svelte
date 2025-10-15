<script lang="ts">
    import SimpleDropdown from 'pika-ux/pika/simple-dropdown/simple-dropdown.svelte';
    import { Button } from 'pika-ux/shadcn/button';
    import * as Dialog from 'pika-ux/shadcn/dialog';
    import { Input } from 'pika-ux/shadcn/input';
    import { Label } from 'pika-ux/shadcn/label';
    import { Textarea } from 'pika-ux/shadcn/textarea';
    import ScopeValueEditor from './scope-value-editor.svelte';

    import Loader from '$icons/lucide/loader';
    import type { AppState } from '$lib/client/app/app.state.svelte';
    import deepEqual from 'deep-equal';
    import type {
        InstructionAugmentationScopeType,
        SemanticDirectiveForCreateOrUpdate,
        SemanticDirectiveScope,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import ConfirmDialog from 'pika-ux/pika/confirm-dialog/confirm-dialog.svelte';
    import MarkdownEditor from 'pika-ux/pika/markdown-editor/markdown-editor.svelte';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import { getContext } from 'svelte';
    import { toast } from 'svelte-sonner';

    interface Props {
        onDirectiveChanged?: () => void;
    }

    let { onDirectiveChanged }: Props = $props();

    const appState = getContext<AppState>('appState');
    const siteAdmin = appState.siteAdmin;
    const iaState = appState.siteAdmin.instructionAugmentation;
    const currentUser = appState.identity?.user?.userId || 'unknown';
    let modDirective = $state<SemanticDirectiveForCreateOrUpdate>({} as SemanticDirectiveForCreateOrUpdate);
    let showConfirmCancelDialog = $state(false);

    let wasProbablyCreatedByInfraAsCode = $derived.by(() => {
        return iaState.directiveDialogMode === 'edit' && !!iaState.currentDirective?.groupId;
    });

    let willDeleteExistingSemanticDirectiveOnSave = $derived.by(() => {
        return iaState.directiveDialogMode === 'edit' && primaryKeyChanged();
    });

    /**
     * If valid is undefined, then we haven't verified the primary key yet and are in the process of verifying it.
     */
    let lastVerifiedPrimaryKey = $state<
        { scope: SemanticDirectiveScope; id: string; valid: boolean | undefined } | undefined
    >(undefined);

    const weWillBeVerifyingPrimaryKey = $derived.by(() => {
        return (
            iaState.directiveDialogMode === 'create' || (iaState.directiveDialogMode === 'edit' && primaryKeyChanged())
        );
    });

    const needsToVerifyPrimaryKey = $derived.by(() => {
        return (
            iaState.directiveDialogMode === 'create' ||
            (iaState.directiveDialogMode === 'edit' && primaryKeyChanged() && !haveVerifiedPrimaryKey())
        );
    });

    function haveVerifiedPrimaryKey() {
        return (
            !!lastVerifiedPrimaryKey &&
            lastVerifiedPrimaryKey.scope.scopeType === modDirective.scopeType &&
            deepEqual(lastVerifiedPrimaryKey.scope.scopeValue, modDirective.scopeValue) &&
            lastVerifiedPrimaryKey.id === modDirective.id &&
            lastVerifiedPrimaryKey.valid !== undefined
        );
    }

    function primaryKeyChanged() {
        const mode = iaState.directiveDialogMode;

        // If we're in edit mode but modDirective hasn't been initialized yet, no change
        if (mode === 'edit' && (!modDirective.id || !modDirective.scopeType || !modDirective.scopeValue)) {
            return false;
        }

        const haveScopeTypeAndValue = !!modDirective.scopeType && !!modDirective.scopeValue;
        const ifCombinedTypeHaveBothValues =
            modDirective.scopeType === 'agent-entity'
                ? typeof modDirective.scopeValue === 'object' &&
                  !!modDirective.scopeValue.agent &&
                  !!modDirective.scopeValue.entity
                : true;
        const haveId = !!modDirective.id;

        if (mode === 'edit') {
            // If we don't have a currentDirective to compare against, treat as no change
            if (!iaState.currentDirective) {
                return false;
            }

            return (
                haveScopeTypeAndValue &&
                ifCombinedTypeHaveBothValues &&
                haveId &&
                (modDirective.id !== iaState.currentDirective.id ||
                    modDirective.scopeType !== iaState.currentDirective.scopeType ||
                    !deepEqual(modDirective.scopeValue, iaState.currentDirective.scopeValue))
            );
        } else {
            return haveScopeTypeAndValue && ifCombinedTypeHaveBothValues && haveId;
        }
    }

    async function verifyPrimaryKey() {
        if (primaryKeyChanged() && !haveVerifiedPrimaryKey()) {
            lastVerifiedPrimaryKey = {
                scope: {
                    scopeType: modDirective.scopeType,
                    scopeValue:
                        typeof modDirective.scopeValue === 'object'
                            ? { ...modDirective.scopeValue }
                            : modDirective.scopeValue,
                },
                id: modDirective.id,
                valid: undefined,
            };

            await verifyPrimaryKeyHelper(
                modDirective.scopeType,
                typeof modDirective.scopeValue === 'object' ? { ...modDirective.scopeValue } : modDirective.scopeValue,
                modDirective.id
            );
        }
    }

    async function verifyPrimaryKeyHelper(
        scopeType: InstructionAugmentationScopeType,
        scopeValue: string | number | Record<string, string | number>,
        id: string
    ) {
        const exists = await iaState.semanticDirectiveExists(scopeType, scopeValue, id);

        // The user could have changed the current value of the scopeType/scopeValue/id so we need
        // to make sure that the lastVerifiedPrimaryKey is still the one we are verifying.
        if (
            modDirective.scopeType === scopeType &&
            deepEqual(modDirective.scopeValue, scopeValue) &&
            modDirective.id === id
        ) {
            lastVerifiedPrimaryKey = { scope: { scopeType, scopeValue }, id, valid: !exists };
        }
    }

    const entityFeatureEnabled = $derived(appState.siteAdmin.siteFeatures?.entity?.enabled ?? false);

    const entitySingularLowerIfExists = $derived.by(() => {
        const result = appState.siteAdmin.siteFeatures?.entity?.displayNameSingular;
        return result ? ` (${result.charAt(0).toLowerCase() + result.slice(1)})` : undefined;
    });

    let directiveChanged = $derived.by(() => {
        let showing = iaState.showDirectiveDialog;

        if (showing) {
            let orig = iaState.currentDirective;
            let mod = modDirective;

            if (iaState.directiveDialogMode === 'edit' && orig) {
                return !deepEqual(orig, mod);
            } else {
                return !deepEqual(getDefaultDirective(), mod);
            }
        } else {
            return false;
        }
    });

    interface ValidationError {
        err: string;
        field: string;
    }

    let errors = $derived.by(() => {
        let errors: ValidationError[] = [];

        if (lastVerifiedPrimaryKey && lastVerifiedPrimaryKey.valid === false) {
            errors.push({
                err: 'Semantic directive with this primary key (Scope Type + Scope Value + ID) already exists. Please change one of them.',
                field: 'general',
            });
        }

        if (!modDirective.scopeType) {
            errors.push({
                err: 'Scope type is required',
                field: 'scopeType',
            });
        }
        if (!modDirective.scopeValue && !!modDirective.scopeType) {
            errors.push({
                err: 'Scope value is required',
                field: 'scopeValue',
            });
        }
        if (!modDirective.id) {
            errors.push({
                err: 'Directive ID is required',
                field: 'id',
            });
        }
        if (!modDirective.description) {
            errors.push({
                err: 'Description is required',
                field: 'description',
            });
        }
        if (!modDirective.instructions) {
            errors.push({
                err: 'Instructions are required',
                field: 'instructions',
            });
        }
        return errors;
    });

    $effect(() => {
        const showing = iaState.showDirectiveDialog;
        const orig = iaState.currentDirective;

        if (showing) {
            lastVerifiedPrimaryKey = undefined;
            if (iaState.directiveDialogMode === 'edit' && orig) {
                modDirective = {
                    ...orig,
                };
            } else {
                resetModDirective();
            }
        }
    });

    interface ScopeTypeDetail {
        value: InstructionAugmentationScopeType;
        label: string;
        example: string;
    }

    // Scope type options
    const scopeTypes = $derived.by(() => {
        return [
            { value: 'chatapp', label: 'Chat App', example: 'my-chat-app' },
            { value: 'agent', label: 'Agent', example: 'my-agent-id' },
            { value: 'tool', label: 'Tool', example: 'my-tool-name' },
            { value: 'entity', label: 'Entity', example: 'account-123' },
            {
                ...(entityFeatureEnabled
                    ? {
                          value: 'agent-entity',
                          label: `Agent + Entity${entitySingularLowerIfExists}`,
                          example: 'agent-123#account-123',
                      }
                    : {}),
            },
        ] as ScopeTypeDetail[];
    });

    function resetModDirective() {
        modDirective = getDefaultDirective();
    }

    function getDefaultDirective(): SemanticDirectiveForCreateOrUpdate {
        return {
            scopeType: '' as InstructionAugmentationScopeType,
            scopeValue: '',
            id: '',
            description: '',
            instructions: '',
            createdBy: currentUser,
            lastUpdatedBy: currentUser,
        };
    }

    async function handleSave() {
        if (errors.length > 0 || iaState.isSavingSemanticDirective) return;

        try {
            await iaState.createOrUpdateSemanticDirective(
                modDirective,
                willDeleteExistingSemanticDirectiveOnSave && iaState.currentDirective
                    ? { scope: iaState.currentDirective?.scope, id: iaState.currentDirective?.id }
                    : undefined
            );
            toast.success(
                `Semantic directive ${iaState.directiveDialogMode === 'create' ? 'created' : 'updated'} successfully`
            );
            lastVerifiedPrimaryKey = undefined;
            resetModDirective();
            iaState.showDirectiveDialog = false;

            if (onDirectiveChanged) {
                onDirectiveChanged();
            }
        } catch (ex) {
            toast.error(
                `Failed to ${iaState.directiveDialogMode === 'create' ? 'create' : 'update'} semantic directive. Please try again.`
            );
        }
    }

    function handleCancel(e?: KeyboardEvent | MouseEvent) {
        if (directiveChanged) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            showConfirmCancelDialog = true;
        } else {
            iaState.showDirectiveDialog = false;
        }
    }

    function handleCancelHelper() {
        showConfirmCancelDialog = false;
        lastVerifiedPrimaryKey = undefined;
        resetModDirective();
        iaState.showDirectiveDialog = false;
    }
</script>

<Dialog.Root bind:open={iaState.showDirectiveDialog}>
    <Dialog.Content
        class="w-[800px] max-w-[800px] sm:max-w-[800px] max-h-[90vh] overflow-y-auto"
        onEscapeKeydown={handleCancel}
        onInteractOutside={handleCancel}
        showCloseButton={false}
    >
        <Dialog.Header>
            <Dialog.Title
                >{iaState.directiveDialogMode === 'create' ? 'Create' : 'Edit'} Semantic Directive</Dialog.Title
            >
        </Dialog.Header>

        {#if iaState.isCheckingSemanticDirectiveExists}
            <div class="text-sm text-muted-foreground italic">
                <div class="flex items-center gap-1">
                    <Loader class="h-4 w-4 animate-spin" />
                    Checking if semantic directive with this primary key already exists...
                </div>
            </div>
        {:else if weWillBeVerifyingPrimaryKey}
            <div class="text-sm text-muted-foreground italic">
                {#if lastVerifiedPrimaryKey?.valid === false}
                    <p class="text-red-500">
                        Semantic directive with this primary key (Scope Type + Scope Value + ID) already exists. Please
                        change Scope Type, Scope Value, or ID or delete the existing semantic directive.
                    </p>
                {:else if lastVerifiedPrimaryKey?.valid === true}
                    <p class="text-green-500">
                        Verified that this primary key (Scope Type + Scope Value + ID) is unique.
                    </p>
                {:else}
                    We will verify that the primary key (Scope Type + Scope Value + ID) is unique before saving.
                {/if}
            </div>
        {/if}

        {#if wasProbablyCreatedByInfraAsCode}
            <div class=" text-sm text-muted-foreground italic">
                This semantic directive was probably created by infrastructure-as-code. If you change it then you will
                need to make sure to manually update the corresponding semantic directive in the infrastructure-as-code
                stack it was created in and redeploy the stack.
            </div>
        {/if}

        <div class="space-y-2 text-sm text-muted-foreground italic">
            {#if willDeleteExistingSemanticDirectiveOnSave}
                You changed the primary key of this semantic directive (Scope Type + Scope Value + ID). When you save it
                we will delete the existing semantic directive and save the new one.
            {/if}
        </div>

        <div class="space-y-6 py-4">
            <!-- Scope Configuration -->
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div class="space-y-2">
                        <div class="flex items-center gap-2">
                            <Label for="scopeType">Scope Type</Label>
                            <PopupHelp popoverClasses="text-xs max-w-[400px] p-1">
                                <p>
                                    The type of scope this semantic directive is associated with. This tells us what the
                                    value in scopeValue is.
                                </p>
                            </PopupHelp>
                        </div>
                        <SimpleDropdown
                            bind:value={
                                () => scopeTypes.find((t) => t.value === modDirective.scopeType),
                                (val) => {
                                    if (val && modDirective.scopeType !== val.value) {
                                        modDirective.scopeType = val.value;
                                        modDirective.scopeValue = undefined as any;
                                        if (needsToVerifyPrimaryKey) {
                                            verifyPrimaryKey();
                                        }
                                    }
                                }
                            }
                            options={scopeTypes}
                            mapping={{
                                value: (item) => item.value,
                                label: (item) => item.label,
                            }}
                            inputPlaceholder="Select type..."
                            optionTypeName="scope type"
                            dontShowSearchInput={true}
                        />
                    </div>
                    <ScopeValueEditor
                        bind:directive={modDirective}
                        onChange={() => {
                            if (needsToVerifyPrimaryKey) {
                                verifyPrimaryKey();
                            }
                        }}
                    />
                </div>
            </div>

            <div class="space-y-2">
                <div class="flex items-center gap-2">
                    <Label for="directiveId">Directive ID</Label>
                    <PopupHelp popoverClasses="text-xs max-w-[400px] p-1">
                        <p>This plus scope must be unique across all semantic directives.</p>

                        <p class="mt-2">
                            Just a human-readable ID for the semantic directive. Consider it a variable name: may use
                            dashes and underscores and should start with a letter (no spaces or special characters).
                            E.g. "account-details", "customer-support", "order-status", etc. Used for db queries and to
                            help engineers identify the semantic directive easily in a UI or DB.
                        </p>
                    </PopupHelp>
                </div>
                <Input
                    id="directiveId"
                    bind:value={
                        () => modDirective.id,
                        (val) => {
                            modDirective.id = val;
                            if (needsToVerifyPrimaryKey) {
                                verifyPrimaryKey();
                            }
                        }
                    }
                    placeholder="e.g., welcome-message, error-handling, premium-features"
                    class="font-mono"
                />
            </div>

            <div class="space-y-2">
                <div class="flex items-center gap-2">
                    <Label for="description">Description</Label>
                    <PopupHelp popoverClasses="text-xs max-w-[400px] p-1">
                        This description serves as the decision criteria for the lightweight LLM classifier. When an end
                        user submits a question, the lightweight LLM evaluates whether that specific question requires
                        this particular semantic directive to be injected into the prompt that will be sent to the final
                        LLM.
                    </PopupHelp>
                </div>
                <Textarea
                    id="description"
                    bind:value={modDirective.description}
                    placeholder="Describe when this directive should be used. This helps the LLM decide whether to include it in the prompt..."
                    rows={3}
                />
            </div>

            <div class="space-y-2">
                <div class="flex items-center gap-2">
                    <Label for="instructions">Instructions</Label>
                    <PopupHelp popoverClasses="text-xs max-w-[400px] p-1">
                        If the light-weight LLM determines that this semantic directive should be included in the
                        prompt, then these instructions will be included in the final prompt to the final LLM to guide
                        its response. Can be markdown.
                    </PopupHelp>
                </div>
                <MarkdownEditor
                    bind:value={
                        () => {
                            return modDirective.instructions ?? '';
                        },
                        (val) => {
                            modDirective.instructions = val;
                        }
                    }
                    placeholder="The specific instructions to include in the prompt when this directive is selected..."
                />
                <!-- <Textarea
                    id="instructions"
                    bind:value={modDirective.instructions}
                    placeholder="The specific instructions to include in the prompt when this directive is selected..."
                    class="h-[200px] overflow-y-auto"
                /> -->
            </div>
        </div>

        <Dialog.Footer>
            <Button variant="outline" disabled={iaState.isSavingSemanticDirective} onclick={handleCancel}>Cancel</Button
            >
            <Button
                onclick={handleSave}
                disabled={errors.length > 0 ||
                    !directiveChanged ||
                    (weWillBeVerifyingPrimaryKey &&
                        needsToVerifyPrimaryKey &&
                        lastVerifiedPrimaryKey &&
                        lastVerifiedPrimaryKey.valid === false) ||
                    iaState.isSavingSemanticDirective}
            >
                {#if iaState.isSavingSemanticDirective}
                    <Loader class="h-4 w-4 animate-spin" />
                {/if}
                {iaState.directiveDialogMode === 'create' ? 'Create ' : 'Update'} Directive
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

{#if showConfirmCancelDialog}
    <ConfirmDialog
        bind:open={showConfirmCancelDialog}
        title="Close and Lose Changes?"
        message="Are you sure you want to close and lose your changes? This action cannot be undone."
        onyes={handleCancelHelper}
    />
{/if}
