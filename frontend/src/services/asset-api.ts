import {
    apiClient
} from './api-client';

export type UploadedAsset = {
    id: string;
    assetName: string;
    previewUrl: string;
    originalName: string;
    mimeType:
        | 'image/png'
        | 'image/jpeg'
        | 'image/gif'
        | 'image/webp';
    size: number;
};

export async function uploadAsset(
    file: File
): Promise<UploadedAsset> {
    const formData = new FormData();

    formData.append(
        'file',
        file,
        file.name
    );

    return await apiClient
        .Post<UploadedAsset>(
            '/app/md-editor-fn/api/assets/upload',
            formData
        )
        .send();
}