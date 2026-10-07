/** An input that can never fit the model; retrying it every tick would wedge the queue. */
export function isUnrecoverableAnalysisError(e: unknown): boolean {
    return e instanceof Error && /input is too long|prompt is too long|exceed context limit/i.test(e.message);
}
