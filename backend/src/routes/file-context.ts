import {
    Router
} from 'express';

import {z} from 'zod';

import {
    getCurrentUser,
    CurrentUserError
} from '../middleware/current-user.js';

import {
    getFileContext
} from '../services/file-context.js';

import {
    FnosApiError
} from '../services/fnos/error.js';

import {logger} from '../logger.js';

const requestSchema = z.object({
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

export const fileContextRouter = Router();

fileContextRouter.post(
    '/file-context',
    async (
        request,
        response
    ) => {
        const parsed = requestSchema.safeParse(
            request.body
        );

        if (!parsed.success) {
            response
                .status(400)
                .send({
                    error: 'INVALID_REQUEST',
                    message: '请求参数无效'
                });

            return;
        }

        try {
            const currentUser =
                getCurrentUser(request);

            const context =
                await getFileContext(
                    currentUser.uid,
                    parsed.data.path,
                    parsed.data.language
                );

            response
                .status(200)
                .send(context);
        } catch (error) {
            if (error instanceof CurrentUserError) {
                response
                    .status(401)
                    .send({
                        error: 'USER_CONTEXT_MISSING',
                        message: error.message
                    });

                return;
            }

            if (error instanceof FnosApiError) {
                logger.error(
                    'fnOS API request failed',
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

            const message =
                error instanceof Error
                    ? error.message
                    : String(error);

            logger.error(
                'File context request failed',
                {
                    message
                }
            );

            response
                .status(500)
                .send({
                    error: 'INTERNAL_SERVER_ERROR',
                    message: '无法检查文件状态'
                });
        }
    }
);