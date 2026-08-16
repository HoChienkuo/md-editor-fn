import {
    useEffect,
    useMemo,
    useState
} from 'react';
import DOMPurify from 'dompurify';
import {
    MdEditor
} from 'md-editor-rt';

import type {
    OpenedDocument
} from '../services/document-api';
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

    // 阶段七保存成功后，需要更新这个基准内容。
    const [savedContent] = useState(
        openedDocument.content
    );

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
        setSaveMessage('');
    };

    const handleSave = (currentContent: string) => {
        if (isReadOnly) {
            setSaveMessage(
                '当前文件为只读文件，不能保存'
            );
            return;
        }

        if (currentContent === savedContent) {
            setSaveMessage(
                '当前没有需要保存的修改'
            );
            return;
        }

        setSaveMessage(
            '保存接口将在下一阶段接入，当前修改尚未写入磁盘'
        );
    };

    const documentStatus = isReadOnly
        ? '只读'
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