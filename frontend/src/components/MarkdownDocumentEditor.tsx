import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import DOMPurify from 'dompurify';
import {
    MdEditor
} from 'md-editor-rt';

import {
    saveDocument
} from '../services/document-api';

import type {
    DocumentVersion,
    OpenedDocument
} from '../services/document-api';

import {
    ApiRequestError
} from '../services/api-client';
import {
    useColorTheme
} from '../hooks/use-color-theme';
import {
    useUnsavedChanges
} from '../hooks/use-unsaved-changes';

interface MarkdownDocumentEditorProps {
    openedDocument: OpenedDocument;
}

function getEditorLanguage(): 'zh-CN' | 'en-US' {
    const language = navigator.language.toLowerCase();

    return language.startsWith('zh')
        ? 'zh-CN'
        : 'en-US';
}

function sanitizePreviewHtml(html: string): string {
    return String(
        DOMPurify.sanitize(html, {
            USE_PROFILES: {
                html: true
            }
        })
    );
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

    const [content, setContent] = useState(
        openedDocument.content
    );

    const [
        savedContent,
        setSavedContent
    ] = useState(
        openedDocument.content
    );

    const [
        currentVersion,
        setCurrentVersion
    ] = useState<DocumentVersion>(
        openedDocument.version
    );

    const [isSaving, setIsSaving] = useState(false);

    const [hasConflict, setHasConflict] =
        useState(false);

    const contentRef = useRef(content);

    useEffect(() => {
        contentRef.current = content;
    }, [content]);

    const [saveMessage, setSaveMessage] = useState('');

    const isReadOnly = openedDocument.readOnly;

    const hasUnsavedChanges = useMemo(() => {
        if (isReadOnly) {
            return false;
        }

        return content !== savedContent;
    }, [
        content,
        savedContent,
        isReadOnly
    ]);

    useUnsavedChanges(hasUnsavedChanges);

    useEffect(() => {
        const status = hasUnsavedChanges ? ' *' : '';

        window.document.title =
            `${openedDocument.name}${status} - Markdown 编辑器`;
    }, [
        openedDocument.name,
        hasUnsavedChanges
    ]);

    const handleChange = (nextContent: string) => {
        setContent(nextContent);

        if (!hasConflict) {
            setSaveMessage('');
        }
    };

    const saveCurrentContent = useCallback(
        async (
            contentToSave: string,
            mode: 'manual' | 'auto'
        ) => {
            if (isReadOnly || isSaving || hasConflict) {
                return;
            }

            if (contentToSave === savedContent) {
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
                setSavedContent(contentToSave);
                setCurrentVersion(result.version);

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
            savedContent
        ]
    );

    const handleSave = (currentContent: string) => {
        void saveCurrentContent(
            currentContent,
            'manual'
        );
    };

    useEffect(() => {
        if (
            isReadOnly ||
            isSaving ||
            hasConflict ||
            !hasUnsavedChanges
        ) {
            return;
        }

        const timer = window.setTimeout(() => {
            void saveCurrentContent(
                contentRef.current,
                'auto'
            );
        }, 60 * 1000);

        return () => {
            window.clearTimeout(timer);
        };
    }, [
        content,
        hasConflict,
        hasUnsavedChanges,
        isReadOnly,
        isSaving,
        saveCurrentContent
    ]);

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
                    id={
                        `markdown-editor-${openedDocument.documentId}`
                    }
                    value={content}
                    onChange={handleChange}
                    onSave={handleSave}
                    theme={theme}
                    language={getEditorLanguage()}
                    readOnly={isReadOnly}
                    noUploadImg
                    sanitize={sanitizePreviewHtml}
                    toolbarsExclude={['github']}
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
                    {content.length.toLocaleString()} 个字符
                </span>
            </footer>
        </section>
    );
}