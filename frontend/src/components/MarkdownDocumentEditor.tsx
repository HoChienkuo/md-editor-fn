import {
    useCallback,
    useEffect,
    useRef,
    useState
} from 'react';
import {
    allToolbar,
    MdEditor
} from 'md-editor-rt';
import {
    Emoji,
    ExportPDF,
    Mark
} from '@vavt/rt-extension';
import '@vavt/rt-extension/lib/asset/Emoji.css';
import '@vavt/rt-extension/lib/asset/ExportPDF.css';
import '@vavt/rt-extension/lib/asset/Mark.css';
import type {
    ExposeParam,
    UploadImgCallBackParam,
    UploadImgEvent
} from 'md-editor-rt';
import {
    saveDocument
} from '../services/document-api';

import type {
    DocumentVersion,
    OpenedDocument
} from '../services/document-api';
import {
    uploadAsset
} from '../services/asset-api';

import type {
    UploadedAsset
} from '../services/asset-api';
import {
    ApiRequestError
} from '../services/api-client';
import {
    useColorTheme
} from '../hooks/use-color-theme';
import {
    useUnsavedChanges
} from '../hooks/use-unsaved-changes';
import {
    useMobileLayout
} from '../hooks/use-mobile-layout';

const taskToolbarIndex =
    allToolbar.indexOf('task');

const saveToolbarIndex =
    allToolbar.indexOf('save');

const editorToolbars = [
    ...allToolbar.slice(
        0,
        taskToolbarIndex + 1
    ),
    0,
    1,
    ...allToolbar.slice(
        taskToolbarIndex + 1,
        saveToolbarIndex + 1
    ),
    2,
    ...allToolbar.slice(
        saveToolbarIndex + 1
    )
];

interface MarkdownDocumentEditorProps {
    openedDocument: OpenedDocument;
}

function getEditorLanguage(): 'zh-CN' | 'en-US' {
    const language = navigator.language.toLowerCase();

    return language.startsWith('zh')
        ? 'zh-CN'
        : 'en-US';
}

type InsertedImage = {
    url: string;
    alt: string;
    title: string;
};

function createImageDescription(
    fileName: string
): string {
    const withoutExtension =
        fileName.replace(
            /\.[^.]+$/,
            ''
        );

    const sanitized = withoutExtension
        .replace(
            /[\[\]\\\r\n"]/g,
            ' '
        )
        .replace(
            /\s+/g,
            ' '
        )
        .trim()
        .slice(0, 100);

    return sanitized || '图片';
}

function toInsertedImage(
    asset: UploadedAsset
): InsertedImage {
    const description =
        createImageDescription(
            asset.originalName
        );

    return {
        url: asset.previewUrl,
        alt: description,
        title: description
    };
}

function transformInsertedImageUrl(
    imageUrl: string
): string {
    const value = imageUrl.trim();

    /*
     * 允许本应用的私有图片 URL。
     */
    if (
        value.startsWith(
            '/app/md-editor-fn/api/assets/'
        )
    ) {
        return value;
    }

    /*
     * 当前阶段只允许 HTTPS 网络图片。
     */
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

function createImageMarkdown(
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

function getLineEndingLabel(
    lineEnding: OpenedDocument['lineEnding']
): string {
    switch (lineEnding) {
        case 'crlf':
            return 'CRLF';

        case 'lf':
            return 'LF';

        case 'mixed':
            return '混合换行符';

        case 'none':
            return '无换行符';
    }
}

export function MarkdownDocumentEditor({
                                           openedDocument
                                       }: MarkdownDocumentEditorProps) {
    const theme = useColorTheme();

    const editorRef =
        useRef<ExposeParam | null>(null);

    const initialContent = openedDocument.content;

    const [content, setContent] = useState(
        initialContent
    );

    const contentRef = useRef(initialContent);
    const savedContentRef = useRef(initialContent);

    const [
        hasUnsavedChanges,
        setHasUnsavedChanges
    ] = useState(false);

    const [contentLength, setContentLength] =
        useState(initialContent.length);

    const [
        currentVersion,
        setCurrentVersion
    ] = useState<DocumentVersion>(
        openedDocument.version
    );

    const [isSaving, setIsSaving] = useState(false);

    const [hasConflict, setHasConflict] =
        useState(false);

    const [saveMessage, setSaveMessage] = useState('');

    const isReadOnly = openedDocument.readOnly;

    const isMobileLayout =
        useMobileLayout();

    useUnsavedChanges(hasUnsavedChanges);

    useEffect(() => {
        const status = hasUnsavedChanges ? ' *' : '';

        window.document.title =
            `${openedDocument.name}${status} - Markdown 编辑器`;
    }, [
        openedDocument.name,
        hasUnsavedChanges
    ]);

    const saveCurrentContent = useCallback(
        async (
            contentToSave: string,
            mode: 'manual' | 'auto'
        ) => {
            if (isReadOnly || isSaving || hasConflict) {
                return;
            }

            if (contentToSave === savedContentRef.current) {
                if (mode === 'manual') {
                    setSaveMessage(
                        '当前没有需要保存的修改'
                    );
                }

                return;
            }

            setIsSaving(true);

            if (mode === 'manual') {
                setSaveMessage('正在保存……');
            }

            try {
                const result = await saveDocument(
                    openedDocument.documentId,
                    contentToSave,
                    currentVersion
                );

                /*
                 * 保存请求发出后，用户可能继续输入。
                 * 这里只把实际发送给后端的内容设为保存基准，
                 * 不会错误地把后来输入的内容标记为已保存。
                 */
                savedContentRef.current = contentToSave;
                setCurrentVersion(result.version);
                setHasUnsavedChanges(
                    contentRef.current !== contentToSave
                );

                setSaveMessage(
                    mode === 'auto'
                        ? '已自动保存'
                        : '保存成功'
                );
            } catch (error) {
                if (
                    error instanceof ApiRequestError &&
                    error.errorType ===
                    'DOCUMENT_CONFLICT'
                ) {
                    setHasConflict(true);
                    setSaveMessage(
                        '磁盘文件已被其他用户或程序修改。为避免覆盖，自动保存已经暂停，请先复制当前内容并重新打开文件。'
                    );

                    return;
                }

                setSaveMessage(
                    error instanceof Error
                        ? `保存失败：${error.message}`
                        : '保存失败，请稍后重试'
                );
            } finally {
                setIsSaving(false);
            }
        },
        [
            currentVersion,
            hasConflict,
            isReadOnly,
            isSaving,
            openedDocument.documentId,
        ]
    );

    const saveCurrentContentRef = useRef(
        saveCurrentContent
    );

    useEffect(() => {
        saveCurrentContentRef.current =
            saveCurrentContent;
    }, [saveCurrentContent]);

    const autoSaveTimerRef = useRef<number | null>(
        null
    );

    const lengthTimerRef = useRef<number | null>(
        null
    );

    const handleChange = useCallback(
        (nextContent: string) => {
            setContent(nextContent);
            contentRef.current = nextContent;

            setHasUnsavedChanges(
                !isReadOnly &&
                nextContent !== savedContentRef.current
            );

            if (!hasConflict) {
                setSaveMessage('');
            }

            if (lengthTimerRef.current !== null) {
                window.clearTimeout(
                    lengthTimerRef.current
                );
            }

            lengthTimerRef.current = window.setTimeout(
                () => {
                    setContentLength(
                        contentRef.current.length
                    );
                },
                300
            );

            if (autoSaveTimerRef.current !== null) {
                window.clearTimeout(
                    autoSaveTimerRef.current
                );
            }

            if (
                !isReadOnly &&
                !hasConflict &&
                nextContent !== savedContentRef.current
            ) {
                autoSaveTimerRef.current =
                    window.setTimeout(() => {
                        void saveCurrentContentRef.current(
                            contentRef.current,
                            'auto'
                        );
                    }, 60 * 1000);
            }
        },
        [
            hasConflict,
            isReadOnly
        ]
    );

    useEffect(() => {
        return () => {
            if (autoSaveTimerRef.current !== null) {
                window.clearTimeout(
                    autoSaveTimerRef.current
                );
            }

            if (lengthTimerRef.current !== null) {
                window.clearTimeout(
                    lengthTimerRef.current
                );
            }
        };
    }, []);

    const [
        isUploadingImage,
        setIsUploadingImage
    ] = useState(false);

    const uploadImageFiles = useCallback(
        async (
            files: File[]
        ): Promise<InsertedImage[]> => {
            if (isReadOnly) {
                setSaveMessage(
                    '当前文件为只读文件，不能插入图片'
                );

                return [];
            }

            if (
                isUploadingImage ||
                files.length === 0
            ) {
                return [];
            }

            setIsUploadingImage(true);

            setSaveMessage(
                files.length > 1
                    ? `正在上传 ${files.length} 张图片……`
                    : '正在上传图片……'
            );

            const uploadedImages:
                InsertedImage[] = [];

            const failureMessages:
                string[] = [];

            /*
             * 顺序上传，避免多张 10 MB 图片同时进入后端内存。
             */
            for (const file of files) {
                try {
                    const asset =
                        await uploadAsset(file);

                    uploadedImages.push(
                        toInsertedImage(asset)
                    );
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : '未知错误';

                    failureMessages.push(
                        `${file.name}：${message}`
                    );
                }
            }

            setIsUploadingImage(false);

            if (
                uploadedImages.length > 0 &&
                failureMessages.length === 0
            ) {
                setSaveMessage(
                    uploadedImages.length > 1
                        ? `已上传 ${uploadedImages.length} 张图片`
                        : '图片上传成功'
                );
            } else if (
                uploadedImages.length > 0 &&
                failureMessages.length > 0
            ) {
                setSaveMessage(
                    `已上传 ${uploadedImages.length} 张，` +
                    `${failureMessages.length} 张失败：` +
                    failureMessages.join('；')
                );
            } else {
                setSaveMessage(
                    `图片上传失败：${
                        failureMessages.join('；') ||
                        '没有可上传的图片'
                    }`
                );
            }

            return uploadedImages;
        },
        [
            isReadOnly,
            isUploadingImage
        ]
    );

    const handleUploadImages:
        UploadImgEvent = useCallback(
        (
            files,
            callback
        ) => {
            void (
                async () => {
                    const uploadedImages =
                        await uploadImageFiles(
                            files
                        );

                    if (
                        uploadedImages.length === 0
                    ) {
                        return;
                    }

                    const callbackValue:
                        UploadImgCallBackParam =
                        uploadedImages;

                    /*
                     * md-editor-rt 自动把这些地址
                     * 插入当前光标位置。
                     */
                    callback(callbackValue);
                }
            )();
        },
        [uploadImageFiles]
    );

    const handleDrop = useCallback(
        (event: DragEvent) => {
            const files = Array.from(
                event.dataTransfer?.files ?? []
            ).filter((file) => {
                return file.type.startsWith(
                    'image/'
                );
            });

            if (files.length === 0) {
                return;
            }

            event.preventDefault();

            void (
                async () => {
                    const uploadedImages =
                        await uploadImageFiles(
                            files
                        );

                    if (
                        uploadedImages.length === 0
                    ) {
                        return;
                    }

                    const markdown =
                        createImageMarkdown(
                            uploadedImages
                        );

                    editorRef.current?.insert(
                        () => ({
                            targetValue:
                                `\n${markdown}\n`,
                            select: false
                        })
                    );
                }
            )();
        },
        [uploadImageFiles]
    );

    const handleSave = () => {
        void saveCurrentContent(
            contentRef.current,
            'manual'
        );
    };

    const documentStatus = isReadOnly
        ? '只读'
        : hasConflict
            ? '保存冲突'
            : isSaving
                ? '保存中'
                : hasUnsavedChanges
                    ? '未保存'
                    : '已保存';

    const encodingLabel = [
        openedDocument.encoding.name.toUpperCase(),
        openedDocument.encoding.bom ? 'BOM' : null
    ]
        .filter(Boolean)
        .join(' ');

    const lineEndingLabel = getLineEndingLabel(
        openedDocument.lineEnding
    );

    return (
        <section
            className={
                `document-editor document-editor--${theme}`
            }
        >
            <header className="document-editor__header">
                <div className="document-editor__file">
                    <strong title={openedDocument.name}>
                        {openedDocument.name}
                    </strong>

                    <span
                        className={
                            hasUnsavedChanges
                                ? 'document-editor__status document-editor__status--dirty'
                                : 'document-editor__status'
                        }
                    >
                        {documentStatus}
                    </span>
                </div>

                <div className="document-editor__metadata">
                    <span>{encodingLabel}</span>
                    <span>{lineEndingLabel}</span>

                    <span className="document-editor__mobile-state">
                        {hasUnsavedChanges
                            ? '内容未保存'
                            : isReadOnly
                                ? '只读模式'
                                : '文件内容未修改'}
                    </span>

                    <span className="document-editor__mobile-state">
                        {contentLength.toLocaleString()} 个字符
                    </span>

                    {isReadOnly && (
                        <span className="document-editor__readonly">
                            当前文件没有写入权限
                        </span>
                    )}
                </div>
            </header>

            {saveMessage && (
                <div className="document-editor__message">
                    {saveMessage}
                </div>
            )}

            <div className="document-editor__main">
                <MdEditor
                    ref={editorRef}
                    id={
                        `markdown-editor-${openedDocument.documentId}`
                    }
                    preview={!isMobileLayout}
                    inputBoxWidth={
                        isMobileLayout
                            ? '100%'
                            : '50%'
                    }
                    value={content}
                    onChange={handleChange}
                    onSave={handleSave}
                    onUploadImg={handleUploadImages}
                    onDrop={handleDrop}
                    transformImgUrl={
                        transformInsertedImageUrl
                    }
                    theme={theme}
                    language={getEditorLanguage()}
                    readOnly={isReadOnly}
                    toolbars={editorToolbars}
                    defToolbars={[
                        <Mark
                            key="mark"
                            title="标注"
                        />,
                        <Emoji
                            key="emoji"
                            title="Emoji"
                        />,
                        <ExportPDF
                            key="export-pdf"
                            value={content}
                            width={
                                isMobileLayout
                                    ? 'calc(100vw - 16px)'
                                    : '870px'
                            }
                            height={
                                isMobileLayout
                                    ? 'calc(100vh - 16px)'
                                    : '600px'
                            }
                        />
                    ]}
                    toolbarsExclude={['github']}
                    footers={[]}
                />
            </div>

            <footer className="document-editor__footer">
                <span>
                    {hasUnsavedChanges
                        ? '内容已修改但尚未保存'
                        : isReadOnly
                            ? '只读模式'
                            : '文件内容未修改'}
                </span>

                <span>
                    {contentLength.toLocaleString()} 个字符
                </span>
            </footer>
        </section>
    );
}
