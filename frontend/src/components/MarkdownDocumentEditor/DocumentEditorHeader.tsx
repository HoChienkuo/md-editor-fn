type DocumentEditorHeaderProps = {
    fileName: string;
    documentStatus: string;
    hasUnsavedChanges: boolean;
    encodingLabel: string;
    lineEndingLabel: string;
    contentLength: number;
    isReadOnly: boolean;
};

export function DocumentEditorHeader({
    fileName,
    documentStatus,
    hasUnsavedChanges,
    encodingLabel,
    lineEndingLabel,
    contentLength,
    isReadOnly
}: DocumentEditorHeaderProps) {
    return (
        <header className="document-editor__header">
            <div className="document-editor__file">
                <strong title={fileName}>
                    {fileName}
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
    );
}
