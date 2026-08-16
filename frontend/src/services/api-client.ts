import {
    createAlova
} from 'alova';

import adapterFetch from 'alova/fetch';

type ApiErrorBody = {
    error?: string;
    message?: string;
    code?: string | number;
};

export class ApiRequestError extends Error {
    readonly status: number;
    readonly code?: string | number;
    readonly errorType?: string;

    constructor(
        message: string,
        status: number,
        code?: string | number,
        errorType?: string
    ) {
        super(message);

        this.name = 'ApiRequestError';
        this.status = status;
        this.code = code;
        this.errorType = errorType;
    }
}

export const apiClient = createAlova({
    baseURL: window.location.origin,

    requestAdapter: adapterFetch(),

    responded: async (response) => {
        if (response.ok) {
            return await response.json();
        }

        let body: ApiErrorBody = {};

        try {
            body =
                await response.json() as ApiErrorBody;
        } catch {
            // 使用下面的默认错误消息
        }

        throw new ApiRequestError(
            body.message ??
            `请求失败：HTTP ${response.status}`,
            response.status,
            body.code,
            body.error
        );
    }
});