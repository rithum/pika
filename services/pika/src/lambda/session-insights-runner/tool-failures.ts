/**
 * Extracts tool-failure bodies (those starting with sentinel) from a message's Bedrock orchestration traces.
 */
export function extractToolFailuresFromTraces(traces: unknown[] | undefined, sentinel?: string): string[] {
    if (!sentinel) {
        return [];
    }
    const toolFailures: string[] = [];
    traces?.forEach((t) => {
        const observation = (
            t as {
                orchestrationTrace?: {
                    observation?: {
                        actionGroupInvocationOutput?: { text?: string };
                        knowledgeBaseLookupOutput?: { text?: string };
                    };
                };
            }
        ).orchestrationTrace?.observation;
        const observationText = observation?.actionGroupInvocationOutput?.text ?? observation?.knowledgeBaseLookupOutput?.text;
        if (observationText?.startsWith(sentinel)) {
            toolFailures.push(observationText);
        }
    });
    return toolFailures;
}
