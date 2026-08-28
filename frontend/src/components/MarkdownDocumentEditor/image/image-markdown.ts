import type {
    UploadedAsset
} from '../../../services/asset-api';

export type InsertedImage = {
    url: string;
    alt: string;
    title: string;
};

function createImageDescription(fileName: string): string {
    const withoutExtension = fileName.replace(/\.[^.]+$/, '');
    const sanitized = withoutExtension
        .replace(/[\[\]\\\r\n"]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 100);

    return sanitized || '图片';
}

export function toInsertedImage(
    asset: UploadedAsset
): InsertedImage {
    const description = createImageDescription(asset.originalName);

    return {
        url: asset.previewUrl,
        alt: description,
        title: description
    };
}

export function transformInsertedImageUrl(
    imageUrl: string
): string {
    const value = imageUrl.trim();

    if (value.startsWith('/app/md-editor-fn/api/assets/')) {
        return value;
    }

    try {
        const parsedUrl = new URL(value);

        if (parsedUrl.protocol === 'https:') {
            return parsedUrl.href;
        }
    } catch {
        // 相对路径和无效链接暂不支持。
    }

    return '';
}

export function createImageMarkdown(
    images: InsertedImage[]
): string {
    return images
        .map((image) => {
            return (
                `![${image.alt}]` +
                `(${image.url} "${image.title}")`
            );
        })
        .join('\n\n');
}
