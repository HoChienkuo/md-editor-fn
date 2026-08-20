import {
    TrimApp
} from '@trimjs/web-app';

const sdk = new TrimApp();

export async function openExternalUrl(
    url: string
): Promise<void> {
    await sdk.ready();
    await sdk.openURL(url, '_blank');
}

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

export async function setFnosExitPageTips(
    hasUnsavedChanges: boolean
): Promise<void> {
    await sdk.ready();

    /*
     * 普通浏览器独立打开时使用 beforeunload，
     * 不调用 fnOS iframe 宿主接口。
     */
    if (sdk.isStandaloneWeb) {
        return;
    }

    if (hasUnsavedChanges) {
        await sdk.setExitPageTips({
            title: '内容尚未保存',
            content:
                '当前 Markdown 文件还有尚未保存的修改，确定要退出吗？'
        });

        return;
    }

    /*
     * 不传参数表示清除退出提示。
     */
    await sdk.setExitPageTips();
}
