import {
    apiClient
} from './api-client';

export type FileContext = {
    path: string;
    semanticPath: string;
    permissions: {
        readable: boolean;
        writable: boolean;
        deletable: boolean;
    };
    authorizationRequired: boolean;
};

export async function requestFileContext(
    path: string,
    language: string
): Promise<FileContext> {
    return await apiClient
        .Post<FileContext>(
            '/app/md-editor-fn/api/fnos/file-context',
            {
                path,
                language
            }
        )
        .send();
}