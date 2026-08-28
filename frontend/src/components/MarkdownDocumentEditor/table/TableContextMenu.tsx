import type {
    MarkdownTableAlignment,
    MarkdownTableSource,
    PreviewTableOperation
} from './types';

export type PreviewTableContextMenu = {
    left: number;
    top: number;
    startLine: number;
    endLine: number;
    row: number;
    column: number;
};

type TableContextMenuProps = {
    menu: PreviewTableContextMenu;
    table: MarkdownTableSource;
    alignment: MarkdownTableAlignment;
    onOperation: (operation: PreviewTableOperation) => void;
    onAlignment: (
        alignment: Exclude<MarkdownTableAlignment, null>
    ) => void;
};

function TableAlignmentIcon({
    alignment
}: {
    alignment: Exclude<MarkdownTableAlignment, null>;
}) {
    const lineStarts = alignment === 'left'
        ? [3, 3, 3, 3]
        : alignment === 'center'
            ? [3, 5, 3, 6]
            : [3, 7, 3, 9];
    const lineEnds = alignment === 'left'
        ? [17, 13, 17, 11]
        : alignment === 'center'
            ? [17, 15, 17, 14]
            : [17, 17, 17, 17];

    return (
        <svg
            viewBox="0 0 20 20"
            width="18"
            height="18"
            aria-hidden="true"
        >
            {[4, 8, 12, 16].map((y, index) => (
                <line
                    key={y}
                    x1={lineStarts[index]}
                    x2={lineEnds[index]}
                    y1={y}
                    y2={y}
                />
            ))}
        </svg>
    );
}

export function TableContextMenu({
    menu,
    table,
    alignment,
    onOperation,
    onAlignment
}: TableContextMenuProps) {
    return (
        <div
            className="preview-table-context-menu"
            style={{left: menu.left, top: menu.top}}
            role="menu"
            aria-label="表格操作"
        >
            <button type="button" role="menuitem" onClick={() => onOperation('insert-row-above')}>
                上方插入行
            </button>
            <button type="button" role="menuitem" onClick={() => onOperation('insert-row-below')}>
                下方插入行
            </button>
            <button type="button" role="menuitem" onClick={() => onOperation('insert-column-left')}>
                左边插入列
            </button>
            <button type="button" role="menuitem" onClick={() => onOperation('insert-column-right')}>
                右边插入列
            </button>

            <div className="preview-table-context-menu__separator" />

            <button
                type="button"
                role="menuitem"
                disabled={menu.row === 0}
                onClick={() => onOperation('move-row-up')}
            >
                <span>上移本行</span>
                <kbd>Alt+↑</kbd>
            </button>
            <button
                type="button"
                role="menuitem"
                disabled={menu.row >= table.cells.length - 1}
                onClick={() => onOperation('move-row-down')}
            >
                <span>下移本行</span>
                <kbd>Alt+↓</kbd>
            </button>
            <button
                type="button"
                role="menuitem"
                disabled={menu.column === 0}
                onClick={() => onOperation('move-column-left')}
            >
                <span>左移本列</span>
                <kbd>Alt+←</kbd>
            </button>
            <button
                type="button"
                role="menuitem"
                disabled={menu.column >= table.alignments.length - 1}
                onClick={() => onOperation('move-column-right')}
            >
                <span>右移本列</span>
                <kbd>Alt+→</kbd>
            </button>

            <div className="preview-table-context-menu__separator" />

            <button
                type="button"
                role="menuitem"
                className="preview-table-context-menu__danger"
                onClick={() => onOperation('delete-row')}
            >
                删除本行
            </button>
            <button
                type="button"
                role="menuitem"
                className="preview-table-context-menu__danger"
                disabled={table.alignments.length <= 1}
                onClick={() => onOperation('delete-column')}
            >
                删除本列
            </button>

            <div className="preview-table-context-menu__separator" />

            <div
                className="preview-table-context-menu__alignments"
                aria-label="本列对齐方式"
            >
                <button
                    type="button"
                    title="左对齐本列"
                    aria-label="左对齐本列"
                    aria-pressed={alignment === 'left'}
                    onClick={() => onAlignment('left')}
                >
                    <TableAlignmentIcon alignment="left" />
                </button>
                <button
                    type="button"
                    title="居中对齐本列"
                    aria-label="居中对齐本列"
                    aria-pressed={alignment === 'center'}
                    onClick={() => onAlignment('center')}
                >
                    <TableAlignmentIcon alignment="center" />
                </button>
                <button
                    type="button"
                    title="右对齐本列"
                    aria-label="右对齐本列"
                    aria-pressed={alignment === 'right'}
                    onClick={() => onAlignment('right')}
                >
                    <TableAlignmentIcon alignment="right" />
                </button>
            </div>
        </div>
    );
}
