import {callFnosApi} from './client.js';

import type {
    FilePermission
} from './types.js';

export async function checkUserFilePermission(
    uid: number,
    path: string
): Promise<FilePermission> {
    const permissions = await callFnosApi<
        {
            uid: number;
            path: string;
        },
        FilePermission[]
    >(
        'trim.file.checkUserACL',
        {
            uid,
            path
        }
    );

    const permission = permissions.find(
        (item) => item.path === path
    );

    return permission ?? {
        path,
        readable: false,
        writable: false,
        deletable: false
    };
}