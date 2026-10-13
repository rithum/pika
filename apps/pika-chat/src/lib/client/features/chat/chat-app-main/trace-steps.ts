export interface StepItem {
    id: string;
    text: string;
    done: boolean;
}

const DEFAULT_DONE_TEXT = 'Step finished';
const DEFAULT_RUNNING_TEXT = 'Running a step';

type StepEvent = { event: 'start' | 'done'; id: string; label?: unknown; labelDone?: unknown };

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function stepOf(trace: unknown): StepEvent | undefined {
    const step = asRecord(asRecord(trace)?.step);
    if (!step || (step.event !== 'start' && step.event !== 'done') || typeof step.id !== 'string') return undefined;
    return step as StepEvent;
}

function nonEmptyString(value: unknown): string | undefined {
    return typeof value === 'string' && value !== '' ? value : undefined;
}

export function isStepTrace(trace: unknown): boolean {
    return stepOf(trace) !== undefined;
}

export function isActivityTrace(trace: unknown): boolean {
    const rationale = asRecord(asRecord(asRecord(trace)?.orchestrationTrace)?.rationale);
    return rationale?.traceId === 'activity' && rationale.text === '';
}

export function buildStepItems(traces: readonly unknown[] | undefined): StepItem[] {
    const items: StepItem[] = [];
    const labels: { label?: string; labelDone?: string }[] = [];
    // The id is per tool, not per call: parallel calls to one tool share it, so a done closes the oldest open start.
    const openIndicesById = new Map<string, number[]>();

    for (const trace of traces ?? []) {
        const step = stepOf(trace);
        if (!step) continue;
        const open = openIndicesById.get(step.id);

        if (step.event === 'start') {
            if (open) {
                open.push(items.length);
            } else {
                openIndicesById.set(step.id, [items.length]);
            }
            items.push({ id: step.id, text: '', done: false });
            labels.push({ label: nonEmptyString(step.label), labelDone: nonEmptyString(step.labelDone) });
        } else {
            const oldest = open?.shift();
            if (oldest === undefined) {
                items.push({ id: step.id, text: '', done: true });
                labels.push({});
            } else {
                items[oldest].done = true;
                if (open!.length === 0) openIndicesById.delete(step.id);
            }
        }
    }

    return items.map((item, i) => {
        const { label, labelDone } = labels[i];
        const text = item.done ? (labelDone ?? label ?? DEFAULT_DONE_TEXT) : (label ?? DEFAULT_RUNNING_TEXT);
        return { ...item, text };
    });
}
