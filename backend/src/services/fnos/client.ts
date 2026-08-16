import http from 'node:http';
import {randomUUID} from 'node:crypto';

import {applicationName} from '../../config.js';
import {FnosApiError} from './error.js';

import type {
    FnosApiRequest,
    FnosApiResponse
} from './types.js';

const fnosApiSocket =
    '/var/run/trim_open_gateway_apiscope.socket';

const fnosApiPath =
    '/api/v1/trimapp';

const maximumResponseSize = 2 * 1024 * 1024;

function getApiToken(): string {
    const token = process.env.TRIM_API_TOKEN?.trim();

    if (!token) {
        throw new FnosApiError(
            'fnOS 没有向应用注入 TRIM_API_TOKEN',
            -1,
            ''
        );
    }

    return token;
}

export async function callFnosApi<
    TRequest extends Record<string, unknown>,
    TResponse
>(
    method: string,
    data: TRequest
): Promise<TResponse> {
    const requestId = randomUUID();
    const token = getApiToken();

    const body: FnosApiRequest<TRequest> = {
        reqId: requestId,
        req: method,
        appName: applicationName,
        data
    };

    const serializedBody = JSON.stringify(body);

    return await new Promise<TResponse>(
        (resolve, reject) => {
            const request = http.request(
                {
                    socketPath: fnosApiSocket,
                    path: fnosApiPath,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`,
                        'Content-Length': Buffer.byteLength(
                            serializedBody
                        )
                    }
                },
                (response) => {
                    const chunks: Buffer[] = [];
                    let receivedSize = 0;

                    response.on(
                        'data',
                        (chunk: Buffer) => {
                            receivedSize += chunk.length;

                            if (
                                receivedSize >
                                maximumResponseSize
                            ) {
                                request.destroy(
                                    new Error(
                                        'fnOS API 响应超过大小限制'
                                    )
                                );

                                return;
                            }

                            chunks.push(chunk);
                        }
                    );

                    response.on(
                        'end',
                        () => {
                            try {
                                const responseText = Buffer
                                    .concat(chunks)
                                    .toString('utf8');

                                if (
                                    !response.statusCode ||
                                    response.statusCode < 200 ||
                                    response.statusCode >= 300
                                ) {
                                    reject(
                                        new FnosApiError(
                                            `fnOS API HTTP 错误：${
                                                response.statusCode ?? 0
                                            }`,
                                            response.statusCode ?? -1,
                                            requestId
                                        )
                                    );

                                    return;
                                }

                                const result = JSON.parse(
                                    responseText
                                ) as FnosApiResponse<TResponse>;

                                if (result.code !== 0) {
                                    reject(
                                        new FnosApiError(
                                            result.msg ||
                                            'fnOS API 调用失败',
                                            result.code,
                                            result.reqId || requestId
                                        )
                                    );

                                    return;
                                }

                                resolve(result.data);
                            } catch (error) {
                                reject(error);
                            }
                        }
                    );

                    response.on(
                        'error',
                        reject
                    );
                }
            );

            request.setTimeout(
                10_000,
                () => {
                    request.destroy(
                        new Error('fnOS API 请求超时')
                    );
                }
            );

            request.on(
                'error',
                reject
            );

            request.write(serializedBody);
            request.end();
        }
    );
}
