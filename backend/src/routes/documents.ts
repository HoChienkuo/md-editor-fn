import {
    Router
} from 'express';

import {
    z
} from 'zod';

import {
    getCurrentUser,
    CurrentUserError
} from '../middleware/current-user.js';

import {
    openMarkdownDocument
} from '../documents/open-document.js';

import {
    DocumentError
} from '../documents/error.js';

import {
    FnosApiError
} from '../services/fnos/error.js';

import {
    logger
} from '../logger.js';

const openRequestSchema = z.object({
    path: z
        .string()
        .trim()
        .min(1)
        .max(4096),

    language: z
        .string()
        .trim()
        .regex(
            /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/
        )
        .default('zh-CN')
});

export const documentsRouter =
    Router();

documentsRouter.post(
    '/open',
    async (
        request,
        response
    ) => {
        const parsed =
            openRequestSchema.safeParse(
                request.body
            );

        if (!parsed.success) {
            response
                .status(400)
                .send({
                    error: 'INVALID_REQUEST',
                    message: '打开文件请求无效'
                });

            return;
        }

        try {
            const currentUser =
                getCurrentUser(request);

            const document =
                await openMarkdownDocument(
                    currentUser.uid,
                    parsed.data.path,
                    parsed.data.language
                );

            response
                .status(200)
                .send(document);
        } catch (error) {
            if (
                error instanceof CurrentUserError
            ) {
                response
                    .status(401)
                    .send({
                        error: 'USER_CONTEXT_MISSING',
                        message: error.message
                    });

                return;
            }

            if (
                error instanceof DocumentError
            ) {
                response
                    .status(error.status)
                    .send({
                        error: error.code,
                        message: error.message
                    });

                return;
            }

            if (
                error instanceof FnosApiError
            ) {
                logger.error(
                    'fnOS API failed while opening document',
                    {
                        code: error.code,
                        requestId: error.requestId,
                        message: error.message
                    }
                );

                response
                    .status(502)
                    .send({
                        error: 'FNOS_API_ERROR',
                        message: error.message,
                        code: error.code
                    });

                return;
            }

            logger.error(
                'Unexpected document open failure',
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
                    message: '无法打开 Markdown 文件'
                });
        }
    }
);