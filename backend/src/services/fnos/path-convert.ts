import {callFnosApi} from './client.js';

import type {
    ConvertPathResponse
} from './types.js';

export async function convertDisplayPath(
    path: string,
    language: string
): Promise<string> {
    const response = await callFnosApi<
        {
            path: string;
            language: string;
        },
        ConvertPathResponse
    >(
        'trim.file.convertPath',
        {
            path,
            language
        }
    );

    if (response.status !== 0) {
        return '';
    }

    const converted =
        response.result.find(
            (item) => item.path === path
        ) ??
        response.result[0];

    return converted?.semanticPath ?? '';
}