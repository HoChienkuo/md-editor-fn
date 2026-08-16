import {
    createHash
} from 'node:crypto';

import type {
    DocumentVersion
} from './types.js';

export function createDocumentVersion(
    fileBuffer: Buffer,
    mtimeMs: number,
    size: number
): DocumentVersion {
    const hash = createHash('sha256')
        .update(fileBuffer)
        .digest('hex');

    return {
        mtimeMs,
        size,
        hash
    };
}