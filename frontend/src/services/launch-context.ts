export type LaunchContext =
    | {
    type: 'file';
    path: string;
    fileName: string;
    extension: string;
}
    | {
    type: 'missing-path';
}
    | {
    type: 'invalid-path';
    reason: string;
};

const supportedExtensions = new Set([
    'md',
    'markdown'
]);

function getFileName(filePath: string): string {
    /*
     * fnOS 使用 Linux 路径，一般是 "/"。
     * 兼容反斜杠只是为了防止异常输入导致显示错误。
     */
    const segments = filePath
        .replaceAll('\\', '/')
        .split('/')
        .filter(Boolean);

    return segments[
        segments.length - 1
    ] ?? '';
}

function getExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');

    if (
        lastDotIndex <= 0 ||
        lastDotIndex === fileName.length - 1
    ) {
        return '';
    }

    return fileName
        .slice(lastDotIndex + 1)
        .toLowerCase();
}

export function readLaunchContext(): LaunchContext {
    const searchParameters = new URLSearchParams(
        window.location.search
    );

    /*
     * URLSearchParams.get() 已经负责 URL 解码。
     * 这里不要再次调用 decodeURIComponent，
     * 否则包含 "%" 的文件名可能被重复解码。
     */
    const path = searchParameters.get('path');

    if (path === null) {
        return {
            type: 'missing-path'
        };
    }

    const trimmedPath = path.trim();

    if (!trimmedPath) {
        return {
            type: 'invalid-path',
            reason: 'path 参数为空'
        };
    }

    if (trimmedPath.length > 4096) {
        return {
            type: 'invalid-path',
            reason: 'path 参数过长'
        };
    }

    if (trimmedPath.includes('\0')) {
        return {
            type: 'invalid-path',
            reason: 'path 参数包含非法字符'
        };
    }

    const fileName = getFileName(trimmedPath);

    if (!fileName) {
        return {
            type: 'invalid-path',
            reason: '无法从 path 参数中识别文件名'
        };
    }

    const extension = getExtension(fileName);

    if (!supportedExtensions.has(extension)) {
        return {
            type: 'invalid-path',
            reason: '当前入口只支持 .md 和 .markdown 文件'
        };
    }

    return {
        type: 'file',
        path: trimmedPath,
        fileName,
        extension
    };
}
