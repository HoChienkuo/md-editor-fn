import {
    mkdir,
    open,
    readFile,
    unlink
} from 'node:fs/promises';

import {
    randomUUID
} from 'node:crypto';

import path from 'node:path';

import {
    applicationDataDirectory
} from '../config.js';

const maximumImageSize =
    10 * 1024 * 1024;

const validAssetNamePattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/;

type SupportedImageExtension =
    | 'png'
    | 'jpg'
    | 'gif'
    | 'webp';

type SupportedImageMimeType =
    | 'image/png'
    | 'image/jpeg'
    | 'image/gif'
    | 'image/webp';

type DetectedImageType = {
    extension: SupportedImageExtension;
    mimeType: SupportedImageMimeType;
};

export type StoredAsset = {
    id: string;
    assetName: string;
    previewUrl: string;
    originalName: string;
    mimeType: SupportedImageMimeType;
    size: number;
};

export type LoadedAsset = {
    buffer: Buffer;
    mimeType: SupportedImageMimeType;
};

export class AssetError extends Error {
    readonly code: string;
    readonly status: number;

    constructor(
        code: string,
        message: string,
        status: number
    ) {
        super(message);

        this.name = 'AssetError';
        this.code = code;
        this.status = status;
    }
}

function detectImageType(
    buffer: Buffer
): DetectedImageType {
    /*
     * PNG 文件头：
     * 89 50 4E 47 0D 0A 1A 0A
     */
    if (
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(
            Buffer.from([
                0x89,
                0x50,
                0x4e,
                0x47,
                0x0d,
                0x0a,
                0x1a,
                0x0a
            ])
        )
    ) {
        return {
            extension: 'png',
            mimeType: 'image/png'
        };
    }

    /*
     * JPEG 文件头通常以 FF D8 FF 开始。
     */
    if (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
    ) {
        return {
            extension: 'jpg',
            mimeType: 'image/jpeg'
        };
    }

    /*
     * GIF87a / GIF89a。
     */
    if (buffer.length >= 6) {
        const signature = buffer
            .subarray(0, 6)
            .toString('ascii');

        if (
            signature === 'GIF87a' ||
            signature === 'GIF89a'
        ) {
            return {
                extension: 'gif',
                mimeType: 'image/gif'
            };
        }
    }

    /*
     * WebP：
     * 开头是 RIFF，第 8～11 字节是 WEBP。
     */
    if (
        buffer.length >= 12 &&
        buffer
            .subarray(0, 4)
            .toString('ascii') === 'RIFF' &&
        buffer
            .subarray(8, 12)
            .toString('ascii') === 'WEBP'
    ) {
        return {
            extension: 'webp',
            mimeType: 'image/webp'
        };
    }

    throw new AssetError(
        'UNSUPPORTED_IMAGE_TYPE',
        '只支持 PNG、JPEG、GIF 和 WebP 图片',
        415
    );
}

function getUserAssetDirectory(
    uid: number
): string {
    return path.join(
        applicationDataDirectory,
        'assets',
        String(uid)
    );
}

function getAssetMimeType(
    assetName: string
): SupportedImageMimeType {
    const extension = path
        .extname(assetName)
        .toLowerCase();

    switch (extension) {
        case '.png':
            return 'image/png';

        case '.jpg':
            return 'image/jpeg';

        case '.gif':
            return 'image/gif';

        case '.webp':
            return 'image/webp';

        default:
            throw new AssetError(
                'ASSET_NOT_FOUND',
                '图片不存在',
                404
            );
    }
}

function mapAssetFileError(
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
            throw new AssetError(
                'ASSET_NOT_FOUND',
                '图片不存在',
                404
            );
        }

        if (
            code === 'EACCES' ||
            code === 'EPERM' ||
            code === 'EROFS'
        ) {
            throw new AssetError(
                'ASSET_ACCESS_DENIED',
                '应用无法访问图片存储目录',
                500
            );
        }

        if (code === 'ENOSPC') {
            throw new AssetError(
                'ASSET_STORAGE_FULL',
                '磁盘空间不足，无法保存图片',
                507
            );
        }
    }

    throw error;
}

export async function storePrivateAsset(
    uid: number,
    originalName: string,
    buffer: Buffer
): Promise<StoredAsset> {
    if (buffer.length === 0) {
        throw new AssetError(
            'EMPTY_IMAGE',
            '上传的图片内容为空',
            400
        );
    }

    if (buffer.length > maximumImageSize) {
        throw new AssetError(
            'IMAGE_TOO_LARGE',
            '图片大小不能超过 10 MB',
            413
        );
    }

    /*
     * 不信任浏览器提交的扩展名或 Content-Type，
     * 根据真实文件头检测格式。
     */
    const detected = detectImageType(buffer);

    const id = randomUUID();

    const assetName =
        `${id}.${detected.extension}`;

    const userDirectory =
        getUserAssetDirectory(uid);

    await mkdir(
        userDirectory,
        {
            recursive: true,
            mode: 0o700
        }
    );

    const assetPath = path.join(
        userDirectory,
        assetName
    );

    let fileHandle:
        Awaited<ReturnType<typeof open>> |
        undefined;

    let shouldRemovePartialFile = false;

    try {
        fileHandle = await open(
            assetPath,
            'wx',
            0o600
        );

        shouldRemovePartialFile = true;

        await fileHandle.writeFile(buffer);
        await fileHandle.sync();

        await fileHandle.close();
        fileHandle = undefined;

        shouldRemovePartialFile = false;
    } catch (error) {
        try {
            await fileHandle?.close();
        } catch {
            // 忽略关闭失败。
        }

        fileHandle = undefined;

        if (shouldRemovePartialFile) {
            try {
                await unlink(assetPath);
            } catch {
                // 文件可能尚未创建。
            }
        }

        if (error instanceof AssetError) {
            throw error;
        }

        return mapAssetFileError(error);
    } finally {
        await fileHandle?.close();
    }

    return {
        id,
        assetName,

        previewUrl:
            `/app/md-editor-fn/api/assets/${assetName}`,

        originalName,
        mimeType: detected.mimeType,
        size: buffer.length
    };
}

export async function loadPrivateAsset(
    uid: number,
    assetName: string
): Promise<LoadedAsset> {
    /*
     * 文件名只能是本应用生成的 UUID 和白名单扩展名。
     * ../、斜杠和任意文件名都会被拒绝。
     */
    if (
        !validAssetNamePattern.test(
            assetName
        )
    ) {
        throw new AssetError(
            'ASSET_NOT_FOUND',
            '图片不存在',
            404
        );
    }

    const assetPath = path.join(
        getUserAssetDirectory(uid),
        assetName
    );

    try {
        const buffer = await readFile(
            assetPath
        );

        if (buffer.length > maximumImageSize) {
            throw new AssetError(
                'ASSET_INVALID',
                '图片文件大小异常',
                500
            );
        }

        return {
            buffer,
            mimeType:
                getAssetMimeType(assetName)
        };
    } catch (error) {
        if (error instanceof AssetError) {
            throw error;
        }

        return mapAssetFileError(error);
    }
}