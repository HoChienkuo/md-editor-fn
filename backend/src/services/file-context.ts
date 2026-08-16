import {
    checkUserFilePermission
} from './fnos/file-acl.js';

import {
    convertDisplayPath
} from './fnos/path-convert.js';

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

export async function getFileContext(
    uid: number,
    path: string,
    language: string
): Promise<FileContext> {
    const [
        permission,
        semanticPath
    ] = await Promise.all([
        checkUserFilePermission(
            uid,
            path
        ),

        convertDisplayPath(
            path,
            language
        )
    ]);

    return {
        path,
        semanticPath,
        permissions: {
            readable: permission.readable,
            writable: permission.writable,
            deletable: permission.deletable
        },

        /*
         * 阶段四先用 readable=false 判断需要授权。
         * 授权后仍然为 false，则说明用户本身无权读取、
         * 文件不存在，或授权未成功。
         */
        authorizationRequired:
            !permission.readable
    };
}