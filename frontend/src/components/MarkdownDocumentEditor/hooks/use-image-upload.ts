import {
    useCallback,
    useState
} from 'react';
import type {
    Dispatch,
    RefObject,
    SetStateAction
} from 'react';
import type {
    ExposeParam,
    UploadImgCallBackParam,
    UploadImgEvent
} from 'md-editor-rt';

import {
    uploadAsset
} from '../../../services/asset-api';
import {
    createImageMarkdown,
    toInsertedImage
} from '../image/image-markdown';
import type {
    InsertedImage
} from '../image/image-markdown';

type UseImageUploadOptions = {
    editorRef: RefObject<ExposeParam | null>;
    isReadOnly: boolean;
    setMessage: Dispatch<SetStateAction<string>>;
};

export function useImageUpload({
    editorRef,
    isReadOnly,
    setMessage
}: UseImageUploadOptions) {
    const [isUploadingImage, setIsUploadingImage] =
        useState(false);

    const uploadImageFiles = useCallback(async (
        files: File[]
    ): Promise<InsertedImage[]> => {
        if (isReadOnly) {
            setMessage('当前文件为只读文件，不能插入图片');
            return [];
        }

        if (isUploadingImage || files.length === 0) {
            return [];
        }

        setIsUploadingImage(true);
        setMessage(
            files.length > 1
                ? `正在上传 ${files.length} 张图片……`
                : '正在上传图片……'
        );

        const uploadedImages: InsertedImage[] = [];
        const failureMessages: string[] = [];

        /* 顺序上传，避免多张 10 MB 图片同时进入后端内存。 */
        for (const file of files) {
            try {
                const asset = await uploadAsset(file);
                uploadedImages.push(toInsertedImage(asset));
            } catch (error) {
                const message = error instanceof Error
                    ? error.message
                    : '未知错误';

                failureMessages.push(`${file.name}：${message}`);
            }
        }

        setIsUploadingImage(false);

        if (
            uploadedImages.length > 0 &&
            failureMessages.length === 0
        ) {
            setMessage(
                uploadedImages.length > 1
                    ? `已上传 ${uploadedImages.length} 张图片`
                    : '图片上传成功'
            );
        } else if (
            uploadedImages.length > 0 &&
            failureMessages.length > 0
        ) {
            setMessage(
                `已上传 ${uploadedImages.length} 张，` +
                `${failureMessages.length} 张失败：` +
                failureMessages.join('；')
            );
        } else {
            setMessage(
                `图片上传失败：${
                    failureMessages.join('；') || '没有可上传的图片'
                }`
            );
        }

        return uploadedImages;
    }, [isReadOnly, isUploadingImage, setMessage]);

    const handleUploadImages: UploadImgEvent = useCallback((
        files,
        callback
    ) => {
        void (async () => {
            const uploadedImages = await uploadImageFiles(files);

            if (uploadedImages.length === 0) {
                return;
            }

            const callbackValue: UploadImgCallBackParam =
                uploadedImages;

            callback(callbackValue);
        })();
    }, [uploadImageFiles]);

    const handleDrop = useCallback((event: DragEvent) => {
        const files = Array.from(
            event.dataTransfer?.files ?? []
        ).filter((file) => file.type.startsWith('image/'));

        if (files.length === 0) {
            return;
        }

        event.preventDefault();

        void (async () => {
            const uploadedImages = await uploadImageFiles(files);

            if (uploadedImages.length === 0) {
                return;
            }

            const markdown = createImageMarkdown(uploadedImages);

            editorRef.current?.insert(() => ({
                targetValue: `\n${markdown}\n`,
                select: false
            }));
        })();
    }, [editorRef, uploadImageFiles]);

    return {
        handleUploadImages,
        handleDrop
    };
}
