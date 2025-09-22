import { HttpStatusError } from './http-status-error';

export class BadRequestError extends HttpStatusError {
    constructor(message: string) {
        super(message, 400);
    }
}
