export type DocumentPermissions = {
    readable: boolean;
    writable: boolean;
};

export type DocumentEncoding = {
    name: 'utf-8';
    bom: boolean;
};

export type DocumentLineEnding =
    | 'lf'
    | 'crlf'
    | 'mixed'
    | 'none';

export type DocumentVersion = {
    mtimeMs: number;
    size: number;
    hash: string;
};

export type DocumentSession = {
    id: string;
    uid: number;
    realPath: string;
    name: string;
    createdAt: number;
    lastUsedAt: number;
    permissions: DocumentPermissions;
    encoding: DocumentEncoding;
    lineEnding: DocumentLineEnding;
    version: DocumentVersion;
};

export type OpenedDocument = {
    documentId: string;
    name: string;
    displayPath: string;
    content: string;
    readOnly: boolean;
    permissions: DocumentPermissions;
    encoding: DocumentEncoding;
    lineEnding: DocumentLineEnding;
    version: DocumentVersion;
};