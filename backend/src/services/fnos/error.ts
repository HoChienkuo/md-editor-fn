export class FnosApiError extends Error {
    readonly code: number;
    readonly requestId: string;

    constructor(
        message: string,
        code: number,
        requestId: string
    ) {
        super(message);

        this.name = 'FnosApiError';
        this.code = code;
        this.requestId = requestId;
    }
}