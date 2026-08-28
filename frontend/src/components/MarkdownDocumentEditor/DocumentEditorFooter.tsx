type DocumentEditorFooterProps = {
    hasUnsavedChanges: boolean;
    isReadOnly: boolean;
    contentLength: number;
};

export function DocumentEditorFooter({
    hasUnsavedChanges,
    isReadOnly,
    contentLength
}: DocumentEditorFooterProps) {
    return (
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
    );
}
