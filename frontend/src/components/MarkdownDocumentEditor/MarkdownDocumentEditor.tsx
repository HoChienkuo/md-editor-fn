import {
    useCallback,
    useEffect,
    useRef,
    useState
} from 'react';
import {
    MdEditor
} from 'md-editor-rt';
import {
    Emoji,
    ExportPDF,
    Mark,
    ThemeSwitch
} from '@vavt/rt-extension';
import '@vavt/rt-extension/lib/asset/Emoji.css';
import '@vavt/rt-extension/lib/asset/ExportPDF.css';
import '@vavt/rt-extension/lib/asset/Mark.css';
import '@vavt/rt-extension/lib/asset/ThemeSwitch.css';
import type {
    ExposeParam
} from 'md-editor-rt';
import type {
    OpenedDocument
} from '../../services/document-api';
import {
    useColorTheme
} from '../../hooks/use-color-theme';
import {
    useUnsavedChanges
} from '../../hooks/use-unsaved-changes';
import {
    useMobileLayout
} from '../../hooks/use-mobile-layout';
import {
    DocumentEditorHeader
} from './DocumentEditorHeader';
import {
    DocumentEditorFooter
} from './DocumentEditorFooter';
import {
    TableContextMenu
} from './table/TableContextMenu';
import {
    useDocumentContent
} from './hooks/use-document-content';
import {
    useDocumentSave
} from './hooks/use-document-save';
import {
    useSaveShortcut
} from './hooks/use-save-shortcut';
import {
    useImageUpload
} from './hooks/use-image-upload';
import {
    transformInsertedImageUrl
} from './image/image-markdown';
import {
    getVisibleEditorToolbars
} from './editor-toolbars';
import {
    usePreviewTable
} from './table/use-preview-table';
import {
    PreviewTableLayer
} from './table/PreviewTableLayer';

interface MarkdownDocumentEditorProps {
    openedDocument: OpenedDocument;
}
function getEditorLanguage(): 'zh-CN' | 'en-US' {
    const language = navigator.language.toLowerCase();

    return language.startsWith('zh')
        ? 'zh-CN'
        : 'en-US';
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
    const systemTheme = useColorTheme();
    const [selectedTheme, setSelectedTheme] =
        useState<typeof systemTheme | null>(null);
    const theme = selectedTheme ?? systemTheme;

    const editorRef =
        useRef<ExposeParam | null>(null);

    const isReadOnly = openedDocument.readOnly;
    const {
        content,
        contentRef,
        savedContentRef,
        hasUnsavedChanges,
        setHasUnsavedChanges,
        contentLength,
        updateContent
    } = useDocumentContent(
        openedDocument.content,
        isReadOnly
    );
    const {
        isSaving,
        hasConflict,
        saveMessage,
        setSaveMessage,
        saveCurrentContent,
        saveCurrentContentRef,
        handleContentChanged
    } = useDocumentSave({
        documentId: openedDocument.documentId,
        initialVersion: openedDocument.version,
        isReadOnly,
        contentRef,
        savedContentRef,
        setHasUnsavedChanges
    });

    const isMobileLayout =
        useMobileLayout();

    const visibleEditorToolbars =
        getVisibleEditorToolbars(isMobileLayout);

    const {
        handleUploadImages,
        handleDrop
    } = useImageUpload({
        editorRef,
        isReadOnly,
        setMessage: setSaveMessage
    });

    useUnsavedChanges(hasUnsavedChanges);

    useEffect(() => {
        const status = hasUnsavedChanges ? ' *' : '';

        window.document.title =
            `${openedDocument.name}${status} - Markdown 编辑器`;
    }, [
        openedDocument.name,
        hasUnsavedChanges
    ]);

    const handleChange = useCallback(
        (nextContent: string) => {
            updateContent(nextContent);
            handleContentChanged(nextContent);
        },
        [
            handleContentChanged,
            updateContent
        ]
    );

    const previewTable = usePreviewTable({
        editorRef,
        documentId: openedDocument.documentId,
        isReadOnly,
        contentRef,
        onContentChange: handleChange,
        setMessage: setSaveMessage
    });

    useSaveShortcut({
        activeCellRef: previewTable.activeCellRef,
        contentRef,
        saveCurrentContentRef,
        finishActiveCellEdit: previewTable.finishCellEdit
    });
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
                `document-editor document-editor--${theme}` +
                (isReadOnly
                    ? ' document-editor--readonly'
                    : '')
            }
        >
            <DocumentEditorHeader
                fileName={openedDocument.name}
                documentStatus={documentStatus}
                hasUnsavedChanges={hasUnsavedChanges}
                encodingLabel={encodingLabel}
                lineEndingLabel={lineEndingLabel}
                contentLength={contentLength}
                isReadOnly={isReadOnly}
            />

            {saveMessage && (
                <div className="document-editor__message">
                    {saveMessage}
                </div>
            )}

            <div
                className="document-editor__main"
                {...previewTable.handlers}
            >
                <MdEditor
                    ref={editorRef}
                    id={
                        `markdown-editor-${openedDocument.documentId}`
                    }
                    preview={!isMobileLayout}
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
                    toolbars={visibleEditorToolbars}
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
                        />,
                        <ThemeSwitch
                            key="theme-switch"
                            value={theme}
                            title={
                                theme === 'light'
                                    ? '切换到深色模式'
                                    : '切换到浅色模式'
                            }
                            onChange={setSelectedTheme}
                        />
                    ]}
                    toolbarsExclude={['github']}
                    footers={[]}
                />
            </div>

            <PreviewTableLayer
                editor={previewTable.cellEditor}
                onChange={previewTable.updateCellValue}
                onCommit={previewTable.commitCellEdit}
                onCancel={previewTable.cancelCellEdit}
                onTab={previewTable.moveToAdjacentCell}
                onContextMenu={
                    previewTable.openActiveContextMenu
                }
                onSelectionChange={
                    previewTable.updateCellSelection
                }
                onFormat={previewTable.applyCellFormat}
                toolbar={previewTable.toolbar}
                onToolbarOperation={
                    previewTable.applyToolbarOperation
                }
                onToolbarAlignment={
                    previewTable.applyToolbarAlignment
                }
                onToolbarPointerEnter={
                    previewTable.handleToolbarPointerEnter
                }
                onToolbarPointerLeave={
                    previewTable.handleToolbarPointerLeave
                }
            />

            {previewTable.contextMenu &&
                previewTable.contextMenuTable && (
                <TableContextMenu
                    menu={previewTable.contextMenu}
                    table={previewTable.contextMenuTable}
                    alignment={
                        previewTable.contextMenuAlignment
                    }
                    onOperation={previewTable.applyOperation}
                    onAlignment={previewTable.applyAlignment}
                />
            )}

            <DocumentEditorFooter
                hasUnsavedChanges={hasUnsavedChanges}
                isReadOnly={isReadOnly}
                contentLength={contentLength}
            />
        </section>
    );
}
