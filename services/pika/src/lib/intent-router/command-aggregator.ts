/**
 * Command Aggregator
 *
 * Collects intent router commands from tag definitions for a chat app.
 * Commands are cached per chat app to avoid repeated aggregation.
 *
 * @since 0.18.0
 */

import { LRUCache } from 'lru-cache';
import type {
    IntentRouterFeature,
    TagDefinition,
    TagDefinitionLite,
    TagDefinitionWidget
} from 'pika-shared/types/chatbot/chatbot-types';
import type { AggregatedCommand, IntentRouterCommand } from 'pika-shared/types/chatbot/intent-router-types';

// Cache for aggregated commands per chat app
// Key: chatAppId-configHash
// TTL: 5 minutes (same as tag definition cache)
const commandCache = new LRUCache<string, AggregatedCommand[]>({
    max: 100,
    ttl: 1000 * 60 * 5 // 5 minutes
});

/**
 * Aggregate intent router commands from tag definitions.
 *
 * @param tagDefinitions - Tag definitions for the chat app
 * @param intentRouterConfig - Intent router configuration (for overrides)
 * @returns Aggregated commands sorted by effective priority
 */
export function aggregateCommands(
    tagDefinitions: TagDefinition<TagDefinitionWidget>[],
    intentRouterConfig?: IntentRouterFeature
): AggregatedCommand[] {
    const commands: AggregatedCommand[] = [];
    const overrides = intentRouterConfig?.commandOverrides ?? {};

    for (const tagDef of tagDefinitions) {
        // Skip if no intent router commands defined
        if (!tagDef.intentRouterCommands || tagDef.intentRouterCommands.length === 0) {
            continue;
        }

        const tagId = `${tagDef.scope}.${tagDef.tag}`;
        const tagOverrides = overrides[tagId] ?? {};

        for (const command of tagDef.intentRouterCommands) {
            const cmdOverride = tagOverrides[command.commandId];

            // Skip if disabled by override
            if (cmdOverride?.disabled) {
                continue;
            }

            // Calculate effective priority
            const effectivePriority = command.priority + (cmdOverride?.priorityBoost ?? 0);

            commands.push({
                command,
                tagId,
                effectivePriority
            });
        }
    }

    // Sort by effective priority (highest first)
    commands.sort((a, b) => b.effectivePriority - a.effectivePriority);

    return commands;
}

/**
 * Get aggregated commands for a chat app with caching.
 *
 * @param chatAppId - The chat app ID
 * @param tagDefinitions - Tag definitions for the chat app
 * @param intentRouterConfig - Intent router configuration
 * @returns Aggregated commands
 */
export function getAggregatedCommandsForChatApp(
    chatAppId: string,
    tagDefinitions: TagDefinition<TagDefinitionWidget>[],
    intentRouterConfig?: IntentRouterFeature
): AggregatedCommand[] {
    // Build cache key - include tag definitions' lastUpdate timestamps to invalidate on changes
    const configHash = intentRouterConfig ? JSON.stringify(intentRouterConfig.commandOverrides ?? {}) : 'no-overrides';
    const tagDefHash = tagDefinitions
        .filter(t => t.intentRouterCommands && t.intentRouterCommands.length > 0)
        .map((t) => `${t.scope}.${t.tag}:${t.lastUpdate ?? 'unknown'}:${t.intentRouterCommands?.length ?? 0}`)
        .join(',');
    const cacheKey = `commands-${chatAppId}-${configHash}-${tagDefHash}`;

    // Check cache
    const cached = commandCache.get(cacheKey);
    if (cached) {
        return cached;
    }

    // Aggregate commands
    const commands = aggregateCommands(tagDefinitions, intentRouterConfig);

    // Cache the result
    commandCache.set(cacheKey, commands);

    console.log(`[CommandAggregator] Aggregated ${commands.length} commands for ${chatAppId}`);

    return commands;
}

/**
 * Clear the command cache (useful for testing or admin operations).
 */
export function clearCommandCache(): void {
    commandCache.clear();
}

/**
 * Get commands for testing/debugging purposes.
 * Does not use caching.
 */
export function getCommandsForDebug(
    tagDefinitions: TagDefinition<TagDefinitionWidget>[],
    intentRouterConfig?: IntentRouterFeature
): {
    commands: AggregatedCommand[];
    byTag: Record<string, IntentRouterCommand[]>;
} {
    const commands = aggregateCommands(tagDefinitions, intentRouterConfig);

    // Group by tag for debugging
    const byTag: Record<string, IntentRouterCommand[]> = {};
    for (const cmd of commands) {
        if (!byTag[cmd.tagId]) {
            byTag[cmd.tagId] = [];
        }
        byTag[cmd.tagId].push(cmd.command);
    }

    return { commands, byTag };
}
