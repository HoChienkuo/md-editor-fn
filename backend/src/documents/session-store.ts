import {
    randomUUID
} from 'node:crypto';

import type {
    DocumentEncoding,
    DocumentLineEnding,
    DocumentPermissions,
    DocumentSession,
    DocumentVersion
} from './types.js';

import {
    DocumentError
} from './error.js';

const sessions = new Map<
    string,
    DocumentSession
>();

/*
 * 当前阶段会话两小时未使用后失效。
 */
const sessionIdleTimeoutMs =
    2 * 60 * 60 * 1000;

type CreateSessionInput = {
    uid: number;
    realPath: string;
    name: string;
    permissions: DocumentPermissions;
    encoding: DocumentEncoding;
    lineEnding: DocumentLineEnding;
    version: DocumentVersion;
};

export function createDocumentSession(
    input: CreateSessionInput
): DocumentSession {
    const now = Date.now();

    const session: DocumentSession = {
        id: randomUUID(),
        uid: input.uid,
        realPath: input.realPath,
        name: input.name,
        createdAt: now,
        lastUsedAt: now,
        permissions: input.permissions,
        encoding: input.encoding,
        lineEnding: input.lineEnding,
        version: input.version
    };

    sessions.set(
        session.id,
        session
    );

    return session;
}

export function getDocumentSession(
    documentId: string,
    uid: number
): DocumentSession {
    const session = sessions.get(documentId);

    if (
        !session ||
        session.uid !== uid
    ) {
        /*
         * 用户不匹配时也返回“未找到”，
         * 避免泄露会话是否属于其他用户。
         */
        throw new DocumentError(
            'DOCUMENT_SESSION_NOT_FOUND',
            '文档会话不存在或已经过期',
            404
        );
    }

    const idleTime =
        Date.now() - session.lastUsedAt;

    if (idleTime > sessionIdleTimeoutMs) {
        sessions.delete(documentId);

        throw new DocumentError(
            'DOCUMENT_SESSION_NOT_FOUND',
            '文档会话已经过期',
            404
        );
    }

    session.lastUsedAt = Date.now();

    return session;
}

export function updateDocumentSession(
    session: DocumentSession
): void {
    session.lastUsedAt = Date.now();

    sessions.set(
        session.id,
        session
    );
}

function removeExpiredSessions(): void {
    const now = Date.now();

    for (
        const [documentId, session]
        of sessions
        ) {
        if (
            now - session.lastUsedAt >
            sessionIdleTimeoutMs
        ) {
            sessions.delete(documentId);
        }
    }
}

const cleanupTimer = setInterval(
    removeExpiredSessions,
    15 * 60 * 1000
);

/*
 * 清理定时器不应阻止 Node.js 进程退出。
 */
cleanupTimer.unref();