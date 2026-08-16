import {
    fileContextRouter
} from './routes/file-context.js';
import {
    documentsRouter
} from './routes/documents.js';
import express from 'express';
import type {
    NextFunction,
    Request,
    Response
} from 'express';

import {
    applicationName,
    applicationVersion,
    gatewayPrefix,
    publicDirectory
} from './config.js';

import {logger} from './logger.js';
import {assetsRouter} from "./routes/assets.js";

export function createApplication() {
    const app = express();
    const router = express.Router();

    /*
     * 统一网关位于应用前方。
     * 目前只启用对本地代理相对保守的信任。
     */
    app.set('trust proxy', 'loopback');

    app.disable('x-powered-by');

    app.use(
        express.json({
            limit: '25mb'
        })
    );

    app.use(
        express.urlencoded({
            extended: false,
            limit: '1mb'
        })
    );

    router.get(
        '/api/health',
        (_request: Request, response: Response) => {
            response
                .status(200)
                .type('application/json')
                .send({
                    status: 'ok',
                    app: applicationName,
                    version: applicationVersion,
                    node: process.version,
                    uptimeSeconds: Math.floor(process.uptime())
                });
        }
    );

    router.use(
        '/api/fnos',
        fileContextRouter
    );

    router.use(
        '/api/documents',
        documentsRouter
    );

    router.use(
        '/api/assets',
        assetsRouter
    );

    /*
     * 托管 React 构建文件。
     *
     * index: false 表示由后面的 React fallback
     * 统一负责返回 index.html。
     */
    router.use(
        express.static(publicDirectory, {
            index: false,
            dotfiles: 'ignore',
            etag: true,
            fallthrough: true,
            maxAge: '1h'
        })
    );

    /*
     * React 页面 fallback。
     *
     * Express 5 使用新版 path-to-regexp，
     * 因此这里不写 router.get('*', ...)。
     */
    router.use(
        (
            request: Request,
            response: Response,
            next: NextFunction
        ) => {
            if (
                request.method !== 'GET' &&
                request.method !== 'HEAD'
            ) {
                next();
                return;
            }

            const acceptedType = request.accepts([
                'html',
                'json'
            ]);

            if (acceptedType !== 'html') {
                next();
                return;
            }

            response.sendFile(
                'index.html',
                {
                    root: publicDirectory
                },
                (error) => {
                    if (error) {
                        next(error);
                    }
                }
            );
        }
    );

    /*
     * 统一挂载到 fnOS 网关前缀。
     */
    app.use(gatewayPrefix, router);

    /*
     * 如果请求没有匹配网关前缀，返回 404。
     */
    app.use(
        (
            request: Request,
            response: Response
        ) => {
            response
                .status(404)
                .type('application/json')
                .send({
                    error: 'NOT_FOUND',
                    message: '请求的资源不存在',
                    path: request.path
                });
        }
    );

    /*
     * Express 统一错误处理。
     */
    app.use(
        (
            error: unknown,
            request: Request,
            response: Response,
            _next: NextFunction
        ) => {
            const message =
                error instanceof Error
                    ? error.message
                    : String(error);

            logger.error(
                'Express request failed',
                {
                    method: request.method,
                    path: request.path,
                    message
                }
            );

            if (response.headersSent) {
                return;
            }

            response
                .status(500)
                .type('application/json')
                .send({
                    error: 'INTERNAL_SERVER_ERROR',
                    message: '服务器内部错误'
                });
        }
    );

    return app;
}