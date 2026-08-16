import type {
    Request
} from 'express';

export type CurrentUser = {
    uid: number;
};

export class CurrentUserError extends Error {
    constructor(message: string) {
        super(message);

        this.name = 'CurrentUserError';
    }
}

export function getCurrentUser(
    request: Request
): CurrentUser {
    const rawUserId = request.get(
        'x-trim-userid'
    );

    if (!rawUserId) {
        throw new CurrentUserError(
            '统一网关没有提供当前用户 UID'
        );
    }

    if (!/^\d+$/.test(rawUserId)) {
        throw new CurrentUserError(
            '统一网关提供的用户 UID 格式无效'
        );
    }

    const uid = Number(rawUserId);

    if (
        !Number.isSafeInteger(uid) ||
        uid < 0
    ) {
        throw new CurrentUserError(
            '当前用户 UID 超出有效范围'
        );
    }

    return {
        uid
    };
}