import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const serverDirectory = path.dirname(currentFile);

/*
 * FPK 中编译后的文件位于：
 *
 *   ${TRIM_APPDEST}/server/index.js
 *   ${TRIM_APPDEST}/server/config.js
 *
 * 因此 server 目录的父目录就是应用安装目录。
 */
const inferredApplicationDirectory = path.resolve(
    serverDirectory,
    '..'
);

export const applicationDirectory =
    process.env.APPLICATION_DIRECTORY ??
    inferredApplicationDirectory;

export const publicDirectory = path.join(
    applicationDirectory,
    'public'
);

export const socketPath =
    process.env.SOCKET_PATH ??
    path.join(applicationDirectory, 'app.sock');

export const gatewayPrefix =
    process.env.GATEWAY_PREFIX ??
    '/app/md-editor-fn';

export const applicationName = 'md-editor-fn';

export const applicationVersion = '0.1.1';