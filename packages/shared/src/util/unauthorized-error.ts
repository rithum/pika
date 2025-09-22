import { HttpStatusError } from './http-status-error';

export class UnauthorizedError extends HttpStatusError {
    constructor(message: string) {
        super(message, 401);
    }
}
