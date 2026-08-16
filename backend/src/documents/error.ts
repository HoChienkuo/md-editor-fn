export type DocumentErrorCode =
    | 'INVALID_PATH'
    | 'UNSUPPORTED_FILE_TYPE'
    | 'FILE_NOT_FOUND'
    | 'NOT_A_FILE'
    | 'FILE_TOO_LARGE'
    | 'FILE_NOT_READABLE'
    | 'FILE_ACCESS_DENIED'
    | 'UNSUPPORTED_ENCODING'
    | 'DOCUMENT_SESSION_NOT_FOUND';

export class DocumentError extends Error {
    readonly code: DocumentErrorCode;
    readonly status: number;

    constructor(
        code: DocumentErrorCode,
        message: string,
        status: number
    ) {
        super(message);

        this.name = 'DocumentError';
        this.code = code;
        this.status = status;
    }
}