import {
    constants as fsConstants
} from 'node:fs';

import {
    open,
    realpath
} from 'node:fs/promises';

import path from 'node:path';

import {
    checkUserFilePermission
} from '../services/fnos/file-acl.js';

import {
    convertDisplayPath
} from '../services/fnos/path-convert.js';

import {
    createDocumentSession
} from './session-store.js';

import {
    decodeMarkdown
} from './encoding.js';

import {
    createDocumentVersion
} from './version.js';

import {
    DocumentError
} from './error.js';

import type {
    OpenedDocument
} from './types.js';

const maximumMarkdownSize =
    20 * 1024 * 1024;

const supportedExtensions = new Set([
    '.md',
    '.markdown'
]);

function validateExtension(
    filePath: string
): void {
    const extension = path
        .extname(filePath)
        .toLowerCase();

    if (!supportedExtensions.has(extension)) {
        throw new DocumentError(
            'UNSUPPORTED_FILE_TYPE',
            '只支持 .md 和 .markdown 文件',
            415
        );
    }
}

function mapFileSystemError(
    error: unknown
): never {
    if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error
    ) {
        const code = String(error.code);

        if (
            code === 'ENOENT' ||
            code === 'ENOTDIR'
        ) {
            throw new DocumentError(
                'FILE_NOT_FOUND',
                '文件不存在、已移动或已删除',
                404
            );
        }

        if (
            code === 'EACCES' ||
            code === 'EPERM'
        ) {
            throw new DocumentError(
                'FILE_ACCESS_DENIED',
                '应用当前无法访问这个文件',
                403
            );
        }
    }

    throw error;
}

export async function openMarkdownDocument(
    uid: number,
    requestedPath: string,
    language: string
): Promise<OpenedDocument> {
    if (
        !path.isAbsolute(requestedPath)
    ) {
        throw new DocumentError(
            'INVALID_PATH',
            '文件路径必须是绝对路径',
            400
        );
    }

    validateExtension(requestedPath);

    let resolvedPath: string;

    try {
        resolvedPath = await realpath(
            requestedPath
        );
    } catch (error) {
        return mapFileSystemError(error);
    }

    /*
     * 真实路径也必须是 Markdown，
     * 防止 .md 符号链接指向其他文件类型。
     */
    validateExtension(resolvedPath);

    /*
     * 对解析后的真实路径检查当前用户权限。
     */
    const permission =
        await checkUserFilePermission(
            uid,
            resolvedPath
        );

    if (!permission.readable) {
        throw new DocumentError(
            'FILE_NOT_READABLE',
            '当前用户没有读取这个文件的权限',
            403
        );
    }

    let fileHandle:
        Awaited<ReturnType<typeof open>> |
        undefined;

    try {
        fileHandle = await open(
            resolvedPath,
            fsConstants.O_RDONLY
        );

        const stats = await fileHandle.stat();

        if (!stats.isFile()) {
            throw new DocumentError(
                'NOT_A_FILE',
                '目标路径不是普通文件',
                400
            );
        }

        if (stats.size > maximumMarkdownSize) {
            throw new DocumentError(
                'FILE_TOO_LARGE',
                'Markdown 文件超过 20 MB 限制',
                413
            );
        }

        const fileBuffer =
            await fileHandle.readFile();

        /*
         * 文件在读取过程中可能发生变化，
         * 因此读取结束后重新获取一次状态。
         */
        const finalStats =
            await fileHandle.stat();

        if (
            fileBuffer.length !==
            finalStats.size
        ) {
            throw new DocumentError(
                'FILE_ACCESS_DENIED',
                '文件在读取过程中发生变化，请重试',
                409
            );
        }

        const decoded =
            decodeMarkdown(fileBuffer);

        const version =
            createDocumentVersion(
                fileBuffer,
                finalStats.mtimeMs,
                finalStats.size
            );

        const session =
            createDocumentSession({
                uid,
                realPath: resolvedPath,
                name: path.basename(resolvedPath),
                permissions: {
                    readable: permission.readable,
                    writable: permission.writable
                },
                encoding: decoded.encoding,
                lineEnding:
                decoded.lineEnding,
                version
            });

        let displayPath = '';

        try {
            displayPath =
                await convertDisplayPath(
                    resolvedPath,
                    language
                );
        } catch {
            /*
             * 路径转换失败不应阻止打开文档。
             */
            displayPath = '';
        }

        return {
            documentId: session.id,
            name: session.name,
            displayPath:
                displayPath || session.name,
            content: decoded.content,
            readOnly:
                !session.permissions.writable,
            permissions:
            session.permissions,
            encoding:
            session.encoding,
            lineEnding:
            session.lineEnding,
            version:
            session.version
        };
    } catch (error) {
        if (error instanceof DocumentError) {
            throw error;
        }

        return mapFileSystemError(error);
    } finally {
        await fileHandle?.close();
    }
}