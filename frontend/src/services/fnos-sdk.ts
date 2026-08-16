import {
    TrimApp
} from '@trimjs/web-app';

const sdk = new TrimApp();

export class FileAuthorizationError
    extends Error {
    constructor(message: string) {
        super(message);

        this.name = 'FileAuthorizationError';
    }
}

export async function authorizeKnownFile(
    path: string
): Promise<string[]> {
    if (sdk.isStandaloneWeb) {
        throw new FileAuthorizationError(
            '当前页面不在 fnOS iframe 微应用环境中，无法直接打开授权窗口'
        );
    }

    const result =
        await sdk.authorizeUserFile(path);

    if (!result) {
        throw new FileAuthorizationError(
            '没有收到授权结果'
        );
    }

    if (result.code !== 0) {
        throw new FileAuthorizationError(
            result.msg || '文件授权失败'
        );
    }

    return result.data ?? [];
}