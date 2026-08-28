import {useState} from 'react';
import type {PointerEvent} from 'react';

import type {MarkdownFormatCommand} from './markdown-format';
import type {PreviewTableToolbarState} from './use-preview-table';

type TableToolbarProps = {
    toolbar: PreviewTableToolbarState;
    canFormat: boolean;
    onFormat: (command: MarkdownFormatCommand) => void;
    onInsertText: (text: string) => void;
    onUndo: () => void;
    onRedo: () => void;
    onSave: () => void;
    onPointerEnter: () => void;
    onPointerLeave: () => void;
};

const emojiOptions = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
    '😊', '😉', '😍', '🥰', '🤔', '🫡️', '😎', '🥳',
    '👍', '👎', '👌', '👏', '🙏', '💪', '❤️', '🔥',
    '✅', '❌', '⚠️', '🎉', '💡', '📌', '🚀', '👀'
];

const formatButtons: Array<{
    command: MarkdownFormatCommand;
    label: string;
    title: string;
}> = [
    {command: 'bold', label: 'B', title: '加粗（Ctrl+B）'},
    {command: 'underline', label: 'U', title: '下划线（Ctrl+U）'},
    {command: 'italic', label: 'I', title: '斜体（Ctrl+I）'},
    {command: 'strikethrough', label: 'S', title: '删除线（Ctrl+Shift+X）'},
    {command: 'subscript', label: 'X₂', title: '下标'},
    {command: 'superscript', label: 'X²', title: '上标'},
    {command: 'mark', label: '==', title: '标注'},
    {command: 'inline-code', label: '<>', title: '行内代码'},
    {command: 'link', label: '🔗', title: '链接（Ctrl+K）'},
    {command: 'inline-formula', label: '∑', title: '行内公式'}
];

function preserveEditorSelection(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest('button')) {
        event.preventDefault();
    }
}

function FormatButton({command, disabled, onFormat}: {
    command: MarkdownFormatCommand;
    disabled: boolean;
    onFormat: (command: MarkdownFormatCommand) => void;
}) {
    const button = formatButtons.find((item) => item.command === command)!;

    return (
        <button
            type="button"
            title={button.title}
            aria-label={button.title}
            disabled={disabled}
            onClick={() => onFormat(command)}
        >
            {button.label}
        </button>
    );
}

export function TableToolbar({
    toolbar,
    canFormat,
    onFormat,
    onInsertText,
    onUndo,
    onRedo,
    onSave,
    onPointerEnter,
    onPointerLeave
}: TableToolbarProps) {
    const [emojiOpen, setEmojiOpen] = useState(false);

    return (
        <div
            className="preview-table-toolbar"
            style={{top: toolbar.top, left: toolbar.left}}
            role="toolbar"
            aria-label="当前表格单元格工具栏"
            onPointerDown={preserveEditorSelection}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
        >
            <FormatButton command="bold" disabled={!canFormat} onFormat={onFormat} />
            <FormatButton command="underline" disabled={!canFormat} onFormat={onFormat} />
            <FormatButton command="italic" disabled={!canFormat} onFormat={onFormat} />
            <FormatButton command="strikethrough" disabled={!canFormat} onFormat={onFormat} />
            <span className="preview-table-toolbar__separator" />
            <FormatButton command="subscript" disabled={!canFormat} onFormat={onFormat} />
            <FormatButton command="superscript" disabled={!canFormat} onFormat={onFormat} />
            <FormatButton command="mark" disabled={!canFormat} onFormat={onFormat} />
            <div className="preview-table-toolbar__emoji">
                <button
                    type="button"
                    title="Emoji"
                    aria-label="Emoji"
                    aria-expanded={emojiOpen}
                    disabled={!canFormat}
                    onClick={() => setEmojiOpen((open) => !open)}
                >
                    😊
                </button>
                {emojiOpen && canFormat && (
                    <div className="preview-table-toolbar__emoji-menu">
                        {emojiOptions.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                aria-label={`插入 ${emoji}`}
                                onClick={() => {
                                    onInsertText(emoji);
                                    setEmojiOpen(false);
                                }}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <span className="preview-table-toolbar__separator" />
            <FormatButton command="inline-code" disabled={!canFormat} onFormat={onFormat} />
            <FormatButton command="link" disabled={!canFormat} onFormat={onFormat} />
            <FormatButton command="inline-formula" disabled={!canFormat} onFormat={onFormat} />
            <span className="preview-table-toolbar__separator" />
            <button type="button" title="撤销（Ctrl+Z）" aria-label="撤销" onClick={onUndo}>↶</button>
            <button type="button" title="重做（Ctrl+Y）" aria-label="重做" onClick={onRedo}>↷</button>
            <button type="button" title="保存（Ctrl+S）" aria-label="保存" onClick={onSave}>💾</button>
        </div>
    );
}
