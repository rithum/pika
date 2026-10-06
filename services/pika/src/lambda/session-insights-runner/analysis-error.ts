/** An input that can never fit the model; retrying it every tick would wedge the queue. */
export function isUnrecoverableAnalysisError(e: unknown): boolean {
    return e instanceof Error && (e.name === 'ValidationException' || e.message.includes('Input is too long'));
}
