import {
    constants as fsConstants
} from 'node:fs';

import {
    access,
    open,
    rename,
    unlink
} from 'node:fs/promises';

import path from 'node:path';

import {
    randomUUID
} from 'node:crypto';

import {
    checkUserFilePermission
} from '../services/fnos/file-acl.js';

import {
    DocumentError
} from './error.js';

import {
    encodeMarkdown
} from './encoding.js';

import {
    createDocumentVersion,
    isSameDocumentVersion
} from './version.js';

import {
    getDocumentSession,
    updateDocumentSession
} from './session-store.js';

import {
    withPathLock
} from './path-lock.js';

import type {
    DocumentVersion
} from './types.js';

const maximumMarkdownSize =
    20 * 1024 * 1024;

export type SaveDocumentInput = {
    uid: number;
    documentId: string;
    content: string;
    version: DocumentVersion;
};

export type SavedDocument = {
    documentId: string;
    version: DocumentVersion;
    savedAt: string;
};

function mapSaveFileSystemError(
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
            code === 'EPERM' ||
            code === 'EROFS'
        ) {
            throw new DocumentError(
                'FILE_ACCESS_DENIED',
                '应用无法写入这个文件',
                403
            );
        }

        if (code === 'ENOSPC') {
            throw new DocumentError(
                'SAVE_FAILED',
                '磁盘空间不足，无法保存文件',
                507
            );
        }
    }

    throw error;
}

async function runSaveFileSystemOperation<T>(
    operation: () => Promise<T>
): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        return mapSaveFileSystemError(error);
    }
}

async function syncParentDirectory(
    filePath: string
): Promise<void> {
    const directoryPath = path.dirname(filePath);

    let directoryHandle:
        Awaited<ReturnType<typeof open>> |
        undefined;

    try {
        directoryHandle = await open(
            directoryPath,
            fsConstants.O_RDONLY
        );

        await directoryHandle.sync();
    } catch {
        /*
         * 部分文件系统不支持对目录执行 fsync。
         * 文件本身已经成功替换时，不因为这里失败而报告保存失败。
         */
    } finally {
        await directoryHandle?.close();
    }
}

function isPermissionError(
    error: unknown
): boolean {
    if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error)
    ) {
        return false;
    }

    const code = String(error.code);

    return (
        code === 'EACCES' ||
        code === 'EPERM'
    );
}

async function writeExistingFile(
    filePath: string,
    outputBuffer: Buffer
): Promise<void> {
    let fileHandle:
        Awaited<ReturnType<typeof open>> |
        undefined;

    try {
        /*
         * r+ 只打开现有文件，不在父目录中创建新文件。
         * 这适用于“只授权了单个文件”的情况。
         */
        fileHandle = await open(
            filePath,
            fsConstants.O_RDWR
        );

        /*
         * 先从文件开头覆盖写入，再截断多余的旧内容。
         *
         * 不先 truncate(0)，可以降低写入失败时原文件
         * 直接变成空文件的风险。
         */
        await fileHandle.write(
            outputBuffer,
            0,
            outputBuffer.length,
            0
        );

        await fileHandle.truncate(
            outputBuffer.length
        );

        await fileHandle.sync();
    } finally {
        await fileHandle?.close();
    }
}

export async function saveMarkdownDocument(
    input: SaveDocumentInput
): Promise<SavedDocument> {
    const session = getDocumentSession(
        input.documentId,
        input.uid
    );

    return await withPathLock(
        session.realPath,
        async () => {
            /*
             * ACL 查询对不存在的文件也可能返回 writable=false，
             * 所以先明确检查文件是否仍然存在。
             */
            await runSaveFileSystemOperation(
                () => access(
                    session.realPath,
                    fsConstants.F_OK
                )
            );

            /*
             * 不能只相信打开文件时记录的权限，
             * 保存前必须重新向 fnOS 检查当前用户权限。
             */
            const permission =
                await checkUserFilePermission(
                    input.uid,
                    session.realPath
                );

            if (!permission.writable) {
                throw new DocumentError(
                    'FILE_NOT_WRITABLE',
                    '当前用户没有写入这个文件的权限',
                    403
                );
            }

            /*
             * 客户端传来的版本必须与当前会话版本一致。
             */
            if (
                !isSameDocumentVersion(
                    input.version,
                    session.version
                )
            ) {
                throw new DocumentError(
                    'DOCUMENT_CONFLICT',
                    '当前编辑会话已经过期，请重新打开文件',
                    409
                );
            }

            let sourceHandle:
                Awaited<ReturnType<typeof open>> |
                undefined;

            try {
                sourceHandle =
                    await runSaveFileSystemOperation(
                        () => open(
                            session.realPath,
                            fsConstants.O_RDONLY
                        )
                    );

                const sourceStats =
                    await runSaveFileSystemOperation(
                        () => sourceHandle!.stat()
                    );

                if (!sourceStats.isFile()) {
                    throw new DocumentError(
                        'NOT_A_FILE',
                        '目标路径不是普通文件',
                        400
                    );
                }

                const sourceBuffer =
                    await runSaveFileSystemOperation(
                        () => sourceHandle!.readFile()
                    );

                const finalSourceStats =
                    await runSaveFileSystemOperation(
                        () => sourceHandle!.stat()
                    );

                const diskVersion =
                    createDocumentVersion(
                        sourceBuffer,
                        finalSourceStats.mtimeMs,
                        finalSourceStats.size
                    );

                /*
                 * 磁盘文件与客户端打开时的版本不一致，
                 * 说明它被其他用户或程序修改了。
                 */
                if (
                    !isSameDocumentVersion(
                        diskVersion,
                        input.version
                    )
                ) {
                    throw new DocumentError(
                        'DOCUMENT_CONFLICT',
                        '文件已被其他用户或程序修改，为避免覆盖，保存已取消',
                        409
                    );
                }

                const outputBuffer =
                    encodeMarkdown(
                        input.content,
                        session.encoding,
                        session.lineEnding
                    );

                if (
                    outputBuffer.length >
                    maximumMarkdownSize
                ) {
                    throw new DocumentError(
                        'FILE_TOO_LARGE',
                        '保存后的 Markdown 文件超过 20 MB 限制',
                        413
                    );
                }

                await sourceHandle.close();
                sourceHandle = undefined;

                await runSaveFileSystemOperation(
                    () => replaceFileContent(
                        session.realPath,
                        outputBuffer,
                        sourceStats.mode
                    )
                );

                /*
                 * 重新打开保存后的文件，获得最终文件状态。
                 */
                const savedHandle =
                    await runSaveFileSystemOperation(
                        () => open(
                            session.realPath,
                            fsConstants.O_RDONLY
                        )
                    );

                try {
                    const savedBuffer =
                        await runSaveFileSystemOperation(
                            () => savedHandle.readFile()
                        );

                    const savedStats =
                        await runSaveFileSystemOperation(
                            () => savedHandle.stat()
                        );

                    const newVersion =
                        createDocumentVersion(
                            savedBuffer,
                            savedStats.mtimeMs,
                            savedStats.size
                        );

                    session.version = newVersion;
                    session.permissions = {
                        readable: permission.readable,
                        writable: permission.writable
                    };

                    updateDocumentSession(session);

                    return {
                        documentId: session.id,
                        version: newVersion,
                        savedAt:
                            new Date().toISOString()
                    };
                } finally {
                    await savedHandle.close();
                }
            } finally {
                await sourceHandle?.close();
            }
        }
    );
}

async function replaceFileContent(
    filePath: string,
    outputBuffer: Buffer,
    sourceMode: number
): Promise<void> {
    const directoryPath =
        path.dirname(filePath);

    const temporaryPath = path.join(
        directoryPath,
        `.${path.basename(
            filePath
        )}.${randomUUID()}.tmp`
    );

    let temporaryHandle:
        Awaited<ReturnType<typeof open>> |
        undefined;

    let temporaryFileExists = false;

    try {
        try {
            temporaryHandle = await open(
                temporaryPath,
                fsConstants.O_WRONLY |
                fsConstants.O_CREAT |
                fsConstants.O_EXCL,
                sourceMode
            );

            temporaryFileExists = true;
        } catch (error) {
            if (!isPermissionError(error)) {
                throw error;
            }

            /*
             * 文件级授权通常不包含父目录的新建权限。
             * 此时回退为直接更新已有文件。
             */
            await writeExistingFile(
                filePath,
                outputBuffer
            );

            return;
        }

        await temporaryHandle.writeFile(
            outputBuffer
        );

        await temporaryHandle.sync();

        await temporaryHandle.chmod(
            sourceMode
        );

        await temporaryHandle.close();
        temporaryHandle = undefined;

        try {
            await rename(
                temporaryPath,
                filePath
            );

            temporaryFileExists = false;

            await syncParentDirectory(
                filePath
            );
        } catch (error) {
            if (!isPermissionError(error)) {
                throw error;
            }

            /*
             * 某些目录允许创建临时文件，但不允许替换已有文件。
             * 删除临时文件后回退到直接写入。
             */
            await unlink(temporaryPath);
            temporaryFileExists = false;

            await writeExistingFile(
                filePath,
                outputBuffer
            );
        }
    } finally {
        await temporaryHandle?.close();

        if (temporaryFileExists) {
            try {
                await unlink(temporaryPath);
            } catch {
                // 忽略临时文件清理失败。
            }
        }
    }
}
