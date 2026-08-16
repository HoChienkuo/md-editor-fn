import type {
    DocumentEncoding,
    DocumentLineEnding
} from './types.js';

import {
    DocumentError
} from './error.js';

const utf8Bom = Buffer.from([
    0xef,
    0xbb,
    0xbf
]);

export type DecodedDocument = {
    content: string;
    encoding: DocumentEncoding;
    lineEnding: DocumentLineEnding;
};

function detectLineEnding(
    content: string
): DocumentLineEnding {
    const crlfMatches =
        content.match(/\r\n/g)?.length ?? 0;

    const withoutCrlf = content.replace(
        /\r\n/g,
        ''
    );

    const lfMatches =
        withoutCrlf.match(/\n/g)?.length ?? 0;

    if (
        crlfMatches === 0 &&
        lfMatches === 0
    ) {
        return 'none';
    }

    if (
        crlfMatches > 0 &&
        lfMatches > 0
    ) {
        return 'mixed';
    }

    if (crlfMatches > 0) {
        return 'crlf';
    }

    return 'lf';
}

export function decodeMarkdown(
    fileBuffer: Buffer
): DecodedDocument {
    const hasBom =
        fileBuffer.length >= utf8Bom.length &&
        fileBuffer
            .subarray(0, utf8Bom.length)
            .equals(utf8Bom);

    const contentBuffer = hasBom
        ? fileBuffer.subarray(utf8Bom.length)
        : fileBuffer;

    try {
        /*
         * fatal=true 会拒绝非法 UTF-8，
         * 避免 Node.js 静默替换成 � 后再保存损坏原文件。
         */
        const decoder = new TextDecoder(
            'utf-8',
            {
                fatal: true
            }
        );

        const content = decoder.decode(
            contentBuffer
        );

        return {
            content,
            encoding: {
                name: 'utf-8',
                bom: hasBom
            },
            lineEnding:
                detectLineEnding(content)
        };
    } catch {
        throw new DocumentError(
            'UNSUPPORTED_ENCODING',
            '当前文件不是有效的 UTF-8 Markdown 文件',
            415
        );
    }
}