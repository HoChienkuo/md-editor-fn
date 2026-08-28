import type {PointerEvent} from 'react';

import type {MarkdownFormatCommand} from './markdown-format';
import type {
    MarkdownTableAlignment,
    PreviewTableOperation
} from './types';
import type {PreviewTableToolbarState} from './use-preview-table';

type TableToolbarProps = {
    toolbar: PreviewTableToolbarState;
    canFormat: boolean;
    onFormat: (command: MarkdownFormatCommand) => void;
    onOperation: (operation: PreviewTableOperation) => void;
    onAlignment: (
        alignment: Exclude<MarkdownTableAlignment, null>
    ) => void;
    onPointerEnter: () => void;
    onPointerLeave: () => void;
};

const formatButtons: Array<{
    command: MarkdownFormatCommand;
    label: string;
    title: string;
}> = [
    {command: 'bold', label: 'B', title: '加粗（Ctrl+B）'},
    {command: 'italic', label: 'I', title: '斜体（Ctrl+I）'},
    {
        command: 'strikethrough',
        label: 'S',
        title: '删除线（Ctrl+Shift+X）'
    },
    {command: 'inline-code', label: '<>', title: '行内代码'},
    {command: 'link', label: '🔗', title: '链接（Ctrl+K）'}
];

function preserveEditorSelection(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest('button')) {
        event.preventDefault();
    }
}

export function TableToolbar({
    toolbar,
    canFormat,
    onFormat,
    onOperation,
    onAlignment,
    onPointerEnter,
    onPointerLeave
}: TableToolbarProps) {
    return (
        <div
            className="preview-table-toolbar"
            style={{top: toolbar.top, left: toolbar.left}}
            role="toolbar"
            aria-label="表格工具栏"
            onPointerDown={preserveEditorSelection}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
        >
            {formatButtons.map((button) => (
                <button
                    key={button.command}
                    type="button"
                    title={button.title}
                    aria-label={button.title}
                    disabled={!canFormat}
                    onClick={() => onFormat(button.command)}
                >
                    {button.label}
                </button>
            ))}

            <span className="preview-table-toolbar__separator" />

            <button
                type="button"
                title="上方插入行"
                onClick={() => onOperation('insert-row-above')}
            >
                ↑+行
            </button>
            <button
                type="button"
                title="下方插入行"
                onClick={() => onOperation('insert-row-below')}
            >
                ↓+行
            </button>
            <button
                type="button"
                title="左边插入列"
                onClick={() => onOperation('insert-column-left')}
            >
                ←+列
            </button>
            <button
                type="button"
                title="右边插入列"
                onClick={() => onOperation('insert-column-right')}
            >
                →+列
            </button>

            <button
                type="button"
                title="上移本行"
                disabled={toolbar.row === 0}
                onClick={() => onOperation('move-row-up')}
            >
                ↑行
            </button>
            <button
                type="button"
                title="下移本行"
                disabled={toolbar.row >= toolbar.rowCount - 1}
                onClick={() => onOperation('move-row-down')}
            >
                ↓行
            </button>
            <button
                type="button"
                title="左移本列"
                disabled={toolbar.column === 0}
                onClick={() => onOperation('move-column-left')}
            >
                ←列
            </button>
            <button
                type="button"
                title="右移本列"
                disabled={toolbar.column >= toolbar.columnCount - 1}
                onClick={() => onOperation('move-column-right')}
            >
                →列
            </button>
            <button
                type="button"
                title="删除本行"
                className="preview-table-toolbar__danger"
                onClick={() => onOperation('delete-row')}
            >
                −行
            </button>
            <button
                type="button"
                title="删除本列"
                className="preview-table-toolbar__danger"
                disabled={toolbar.columnCount <= 1}
                onClick={() => onOperation('delete-column')}
            >
                −列
            </button>

            <span className="preview-table-toolbar__separator" />

            {(['left', 'center', 'right'] as const).map((alignment) => (
                <button
                    key={alignment}
                    type="button"
                    title={`${
                        alignment === 'left'
                            ? '左'
                            : alignment === 'center'
                                ? '居中'
                                : '右'
                    }对齐本列`}
                    aria-pressed={toolbar.alignment === alignment}
                    onClick={() => onAlignment(alignment)}
                >
                    {alignment === 'left'
                        ? '≡←'
                        : alignment === 'center'
                            ? '≡'
                            : '→≡'}
                </button>
            ))}
        </div>
    );
}
