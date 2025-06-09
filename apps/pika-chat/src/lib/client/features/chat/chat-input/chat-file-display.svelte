<script lang="ts">
    import { File } from '$lib/icons/lucide';
    import type { ChatMessageFile } from '@pika/shared/types/chatbot/chatbot-types';

    interface Props {
        file: ChatMessageFile;
    }

    const { file }: Props = $props();

</script>

<div
    class="flex items-center rounded-md overflow-hidden bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm max-w-fit"
>
    <!-- File icon -->
    <div class="flex items-center justify-center w-9 h-full bg-blue-400 dark:bg-blue-500 text-white">
        <File style="width: 1.5rem; height: 1.5rem;" />
    </div>

    <!-- File info -->
    <div class="px-2 py-1 flex flex-col justify-center">
        <div class="font-medium text-xs truncate max-w-[100px]" title={file.fileName}>
            {file.fileName}
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400">Document</div>
    </div>
</div> 