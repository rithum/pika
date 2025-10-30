<script lang="ts">
    import X from '$icons/lucide/x';
    import {
        type NameValuePair,
        type UserType,
    } from 'pika-shared/types/chatbot/chatbot-types';
    import PopupHelp from 'pika-ux/pika/popup-help/popup-help.svelte';
    import SimpleDropdown from 'pika-ux/pika/simple-dropdown/simple-dropdown.svelte';
    import { Button } from 'pika-ux/shadcn/button';

    interface Props {
        userType: UserType[] | undefined;
    }

    let { userType = $bindable() }: Props = $props();

    const USER_TYPE_VALUES: NameValuePair<UserType>[] = [
        { value: 'internal-user', name: 'Internal User' },
        { value: 'external-user', name: 'External User' },
    ];

    let valueForList = $derived.by(() => {
        if (!userType || userType.length === 0) {
            return undefined;
        } else {
            return userType.map((type) => {
                const val = USER_TYPE_VALUES.find((t) => t.value === type);
                if (val) {
                    return val;
                } else {
                    return { value: type, name: type } as NameValuePair<UserType>;
                }
            });
        }
    });

    function getValues<T>(items: NameValuePair<T>[]): T[] {
        return items.map((item) => item.value);
    }
</script>

<div class="flex flex-col gap-1">
    <div class="flex items-center gap-2 w-full">
        <PopupHelp popoverClasses="text-xs w-auto p-1">Filter by user type (internal vs external users)</PopupHelp>
        <SimpleDropdown
            bind:value={
                () => valueForList,
                (val) => {
                    if (val === undefined || val.length === 0) {
                        userType = undefined;
                    } else {
                        userType = getValues(val);
                    }
                }
            }
            multiSelect={true}
            wrapperClasses="flex-1 w-full"
            popupWidthClasses="w-[330px]"
            mapping={{
                value: (item) => (typeof item === 'string' ? item : item.value),
                label: (item) => (typeof item === 'string' ? item : (item.name ?? item.value)),
            }}
            options={USER_TYPE_VALUES}
            dontShowSearchInput={true}
            allowClear={true}
            inputPlaceholder="Filter by user type..."
        />
        <Button
            variant="ghost"
            size="icon"
            class="h-4 w-4 text-muted-foreground "
            onclick={() => (userType = undefined)}
        >
            <X />
        </Button>
    </div>
</div>

