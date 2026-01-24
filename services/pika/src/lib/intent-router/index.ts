/**
 * Intent Router Module
 *
 * Provides fast intent classification and command routing for Pika chat apps.
 *
 * @since 0.18.0
 */

export { IntentRouter, INTENT_ROUTER_MODEL, prepareContextForRouter } from './intent-router';
export type { IntentRouterOptions } from './intent-router';

export { buildClassificationPrompt, buildSimpleClassificationPrompt } from './classification-prompt';

export { aggregateCommands, getAggregatedCommandsForChatApp, clearCommandCache, getCommandsForDebug } from './command-aggregator';

export {
    streamCommand,
    streamDispatch,
    streamRouterTrace,
    streamResponse,
    streamDirectAction,
    streamDispatchAction
} from './stream-helpers';
