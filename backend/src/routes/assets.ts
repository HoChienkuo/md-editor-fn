import {
    Router
} from 'express';

import type {
    Request,
    Response
} from 'express';

import multer from 'multer';

import {
    getCurrentUser,
    CurrentUserError
} from '../middleware/current-user.js';

import {
    AssetError,
    loadPrivateAsset,
    storePrivateAsset
} from '../assets/asset-storage.js';

import {
    logger
} from '../logger.js';

const maximumImageSize =
    10 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        files: 1,
        fileSize: maximumImageSize
    }
});

export const assetsRouter = Router();

function sendAssetError(
    response: Response,
    error: unknown
): void {
    if (error instanceof CurrentUserError) {
        response
            .status(401)
            .send({
                error: 'USER_CONTEXT_MISSING',
                message: error.message
            });

        return;
    }

    if (error instanceof AssetError) {
        response
            .status(error.status)
            .send({
                error: error.code,
                message: error.message
            });

        return;
    }

    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            response
                .status(413)
                .send({
                    error: 'IMAGE_TOO_LARGE',
                    message:
                        '图片大小不能超过 10 MB'
                });

            return;
        }

        response
            .status(400)
            .send({
                error: 'UPLOAD_REJECTED',
                message: '图片上传请求无效'
            });

        return;
    }

    logger.error(
        'Unexpected asset request failure',
        {
            message:
                error instanceof Error
                    ? error.message
                    : String(error)
        }
    );

    response
        .status(500)
        .send({
            error: 'INTERNAL_SERVER_ERROR',
            message: '图片处理失败'
        });
}

async function handleUpload(
    request: Request,
    response: Response
): Promise<void> {
    try {
        const currentUser =
            getCurrentUser(request);

        const file = request.file;

        if (!file) {
            response
                .status(400)
                .send({
                    error: 'IMAGE_REQUIRED',
                    message: '请选择要上传的图片'
                });

            return;
        }

        const storedAsset =
            await storePrivateAsset(
                currentUser.uid,
                file.originalname,
                file.buffer
            );

        response
            .status(201)
            .send(storedAsset);
    } catch (error) {
        sendAssetError(
            response,
            error
        );
    }
}

assetsRouter.post(
    '/upload',
    (
        request,
        response
    ) => {
        upload.single('file')(
            request,
            response,
            (error) => {
                if (error) {
                    sendAssetError(
                        response,
                        error
                    );

                    return;
                }

                void handleUpload(
                    request,
                    response
                );
            }
        );
    }
);

assetsRouter.get(
    '/:assetName',
    async (
        request,
        response
    ) => {
        const assetName =
            request.params.assetName;

        if (!assetName) {
            sendAssetError(
                response,
                new AssetError(
                    'ASSET_NOT_FOUND',
                    '图片不存在',
                    404
                )
            );

            return;
        }

        try {
            const currentUser =
                getCurrentUser(request);

            const asset =
                await loadPrivateAsset(
                    currentUser.uid,
                    assetName
                );

            response.set({
                'Content-Type':
                asset.mimeType,

                'Content-Length':
                    String(asset.buffer.length),

                'Cache-Control':
                    'private, max-age=31536000, immutable',

                'X-Content-Type-Options':
                    'nosniff',

                'Content-Security-Policy':
                    "default-src 'none'; sandbox"
            });

            response
                .status(200)
                .send(asset.buffer);
        } catch (error) {
            sendAssetError(
                response,
                error
            );
        }
    }
);
