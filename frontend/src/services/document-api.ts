import {
    apiClient
} from './api-client';

export type DocumentVersion = {
    mtimeMs: number;
    size: number;
    hash: string;
};

export type OpenedDocument = {
    documentId: string;
    name: string;
    displayPath: string;
    content: string;
    readOnly: boolean;
    permissions: {
        readable: boolean;
        writable: boolean;
    };
    encoding: {
        name: 'utf-8';
        bom: boolean;
    };
    lineEnding:
        | 'lf'
        | 'crlf'
        | 'mixed'
        | 'none';
    version: DocumentVersion;
};

export async function openDocument(
    path: string,
    language: string
): Promise<OpenedDocument> {
    return await apiClient
        .Post<OpenedDocument>(
            '/app/md-editor-fn/api/documents/open',
            {
                path,
                language
            }
        )
        .send();
}