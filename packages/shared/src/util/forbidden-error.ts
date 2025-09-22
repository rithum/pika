import { HttpStatusError } from './http-status-error';

export class ForbiddenError extends HttpStatusError {
    constructor(message: string) {
        super(message, 403);
    }
}
