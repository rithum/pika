import { BadRequestError } from 'pika-shared/util/bad-request-error';

export function decodePathParameter(name: string, value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        throw new BadRequestError(`Malformed path parameter: ${name}`);
    }
}
