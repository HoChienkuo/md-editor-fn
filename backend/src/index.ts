import {
    chmodSync,
    existsSync,
    unlinkSync
} from 'node:fs';

import type {Server} from 'node:http';

import {createApplication} from './app.js';

import {
    applicationDirectory,
    applicationName,
    applicationVersion,
    gatewayPrefix,
    publicDirectory,
    socketPath
} from './config.js';

import {logger} from './logger.js';

const application = createApplication();

let server: Server | undefined;
let shuttingDown = false;

function removeSocketFile(): void {
    if (!existsSync(socketPath)) {
        return;
    }

    try {
        unlinkSync(socketPath);

        logger.info(
            'Removed socket file',
            {
                socketPath
            }
        );
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : String(error);

        logger.error(
            'Failed to remove socket file',
            {
                socketPath,
                message
            }
        );

        throw error;
    }
}

function removeSocketFileQuietly(): void {
    if (!existsSync(socketPath)) {
        return;
    }

    try {
        unlinkSync(socketPath);
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : String(error);

        logger.warn(
            'Failed to remove socket during shutdown',
            {
                socketPath,
                message
            }
        );
    }
}

function shutdown(
    signal: string,
    exitCode = 0
): void {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    logger.info(
        'Shutdown requested',
        {
            signal,
            exitCode
        }
    );

    const forceExitTimer = setTimeout(
        () => {
            logger.error(
                'Graceful shutdown timed out'
            );

            removeSocketFileQuietly();
            process.exit(1);
        },
        10_000
    );

    forceExitTimer.unref();

    if (!server) {
        removeSocketFileQuietly();
        process.exit(exitCode);
    }

    server.close((error) => {
        clearTimeout(forceExitTimer);

        if (error) {
            logger.error(
                'HTTP server close failed',
                {
                    message: error.message
                }
            );
        } else {
            logger.info(
                'HTTP server closed'
            );
        }

        removeSocketFileQuietly();

        process.exit(
            error
                ? 1
                : exitCode
        );
    });
}

function start(): void {
    logger.info(
        'Starting application',
        {
            app: applicationName,
            version: applicationVersion,
            node: process.version,
            applicationDirectory,
            publicDirectory,
            gatewayPrefix,
            socketPath
        }
    );

    /*
     * 生命周期脚本启动前已经确认旧进程不存在，
     * 因此这里的 Socket 只能是上次异常退出遗留的。
     */
    removeSocketFile();

    server = application.listen(
        socketPath,
        () => {
            /*
             * 0660 允许应用用户和所属组访问，
             * 不向其他用户开放。
             */
            try {
                chmodSync(socketPath, 0o660);
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : String(error);

                logger.warn(
                    'Could not change socket permissions',
                    {
                        socketPath,
                        message
                    }
                );
            }

            logger.info(
                'Application is listening',
                {
                    socketPath,
                    gatewayPrefix
                }
            );
        }
    );

    server.on(
        'error',
        (error) => {
            logger.error(
                'HTTP server error',
                {
                    message: error.message,
                    stack: error.stack
                }
            );

            shutdown(
                'server-error',
                1
            );
        }
    );
}

process.on(
    'SIGTERM',
    () => {
        shutdown('SIGTERM');
    }
);

process.on(
    'SIGINT',
    () => {
        shutdown('SIGINT');
    }
);

process.on(
    'uncaughtException',
    (error) => {
        logger.error(
            'Uncaught exception',
            {
                message: error.message,
                stack: error.stack
            }
        );

        shutdown(
            'uncaughtException',
            1
        );
    }
);

process.on(
    'unhandledRejection',
    (reason) => {
        logger.error(
            'Unhandled rejection',
            {
                reason:
                    reason instanceof Error
                        ? reason.stack ?? reason.message
                        : String(reason)
            }
        );

        shutdown(
            'unhandledRejection',
            1
        );
    }
);

start();