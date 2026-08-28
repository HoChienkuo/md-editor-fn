import {
    useCallback,
    useEffect,
    useRef,
    useState
} from 'react';
import type {
    ClipboardEvent as ReactClipboardEvent,
    Dispatch,
    FocusEvent as ReactFocusEvent,
    KeyboardEvent as ReactKeyboardEvent,
    MouseEvent as ReactMouseEvent,
    RefObject,
    SetStateAction
} from 'react';
import type {
    ExposeParam
} from 'md-editor-rt';

import {
    openExternalUrl
} from '../../../services/fnos-sdk';
import {
    getMarkdownTableSource,
    operateMarkdownTable,
    serializeMarkdownTable,
    updateMarkdownTableCell
} from './markdown-table';
import type {
    MarkdownTableAlignment,
    MarkdownTableSource,
    PreviewTableOperation
} from './types';
import type {
    PreviewTableContextMenu
} from './TableContextMenu';

type ActivePreviewTableCell = {
    element: HTMLTableCellElement;
    source: MarkdownTableSource;
    row: number;
    column: number;
    originalValue: string;
    originalHtml: string;
};

type StringRef = {
    current: string;
};

type UsePreviewTableOptions = {
    editorRef: RefObject<ExposeParam | null>;
    documentId: string;
    isReadOnly: boolean;
    contentRef: StringRef;
    onContentChange: (content: string) => void;
    setMessage: Dispatch<SetStateAction<string>>;
};

function escapeMarkdownLinkLabel(value: string): string {
    return value.replace(/[\\[\]]/g, '\\$&');
}

function escapeMarkdownLinkDestination(value: string): string {
    return value
        .replace(/\r?\n/g, '')
        .replace(/[\\()]/g, '\\$&');
}

function convertPastedHtmlLinksToMarkdown(
    html: string
): string | null {
    if (!html) {
        return null;
    }

    const fragment = new DOMParser().parseFromString(
        html,
        'text/html'
    );

    if (!fragment.querySelector('a[href]')) {
        return null;
    }

    const convertNode = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent ?? '';
        }

        if (!(node instanceof HTMLElement)) {
            return '';
        }

        if (node.tagName === 'BR') {
            return '\n';
        }

        if (node.tagName === 'A') {
            const href = node.getAttribute('href')?.trim();
            const label = node.textContent?.trim() || href;

            if (!href || !label) {
                return node.textContent ?? '';
            }

            return '[' + escapeMarkdownLinkLabel(label) + '](' +
                escapeMarkdownLinkDestination(href) + ')';
        }

        const content = Array.from(node.childNodes)
            .map(convertNode)
            .join('');

        return ['DIV', 'P', 'LI'].includes(node.tagName)
            ? `${content}\n`
            : content;
    };

    return Array.from(fragment.body.childNodes)
        .map(convertNode)
        .join('')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function insertTextAtSelection(
    cell: HTMLTableCellElement,
    value: string
): void {
    const selection = window.getSelection();

    if (!selection || selection.rangeCount === 0) {
        cell.append(document.createTextNode(value));
        return;
    }

    const range = selection.getRangeAt(0);

    if (!cell.contains(range.commonAncestorContainer)) {
        cell.append(document.createTextNode(value));
        return;
    }

    range.deleteContents();
    const textNode = document.createTextNode(value);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
}

export function usePreviewTable({
    editorRef,
    documentId,
    isReadOnly,
    contentRef,
    onContentChange,
    setMessage
}: UsePreviewTableOptions) {
    const activeCellRef = useRef<ActivePreviewTableCell | null>(null);
    const [contextMenu, setContextMenu] =
        useState<PreviewTableContextMenu | null>(null);

    const replaceTable = useCallback((
        source: MarkdownTableSource,
        replacement: string
    ) => {
        const editorView = editorRef.current?.getEditorView();

        if (editorView) {
            editorView.dispatch({
                changes: {
                    from: source.from,
                    to: source.to,
                    insert: replacement
                }
            });
        } else {
            onContentChange(
                contentRef.current.slice(0, source.from) +
                replacement +
                contentRef.current.slice(source.to)
            );
        }
    }, [contentRef, editorRef, onContentChange]);

    const finishCellEdit = useCallback((
        cell: HTMLTableCellElement,
        cancel = false
    ) => {
        const active = activeCellRef.current;

        if (!active || active.element !== cell) {
            return;
        }

        activeCellRef.current = null;
        cell.removeAttribute('contenteditable');
        cell.classList.remove(
            'editable-preview-table__cell--editing'
        );

        const nextValue = cancel
            ? active.originalValue
            : (cell.innerText || '').replace(/\r?\n/g, ' ').trim();

        if (cancel || nextValue === active.originalValue) {
            cell.innerHTML = active.originalHtml;
            return;
        }

        replaceTable(
            active.source,
            updateMarkdownTableCell(
                active.source,
                active.row,
                active.column,
                nextValue
            )
        );
    }, [replaceTable]);

    const handleContextMenu = useCallback((
        event: ReactMouseEvent<HTMLDivElement>
    ) => {
        if (isReadOnly) {
            return;
        }

        const target = event.target;

        if (!(target instanceof Element)) {
            return;
        }

        const cell = target.closest('th, td');
        const table = cell?.closest('table.editable-preview-table');
        const row = cell?.parentElement;

        if (
            !(cell instanceof HTMLTableCellElement) ||
            !(table instanceof HTMLTableElement) ||
            !(row instanceof HTMLTableRowElement)
        ) {
            return;
        }

        event.preventDefault();

        if (activeCellRef.current) {
            finishCellEdit(activeCellRef.current.element);
        }

        setContextMenu({
            left: Math.max(
                8,
                Math.min(event.clientX, window.innerWidth - 232)
            ),
            top: Math.max(
                8,
                Math.min(event.clientY, window.innerHeight - 446)
            ),
            startLine: Number(table.dataset.line),
            endLine: Number(table.dataset.mdTableEnd),
            row: row.rowIndex,
            column: cell.cellIndex
        });
    }, [finishCellEdit, isReadOnly]);

    const applyOperation = useCallback((
        operation: PreviewTableOperation
    ) => {
        if (!contextMenu) {
            return;
        }

        const source = getMarkdownTableSource(
            contentRef.current,
            contextMenu.startLine,
            contextMenu.endLine
        );

        if (!source) {
            setContextMenu(null);
            return;
        }

        replaceTable(
            source,
            operateMarkdownTable(
                source,
                contextMenu.row,
                contextMenu.column,
                operation
            )
        );
        setContextMenu(null);
    }, [contentRef, contextMenu, replaceTable]);

    const applyAlignment = useCallback((
        alignment: Exclude<MarkdownTableAlignment, null>
    ) => {
        if (!contextMenu) {
            return;
        }

        const source = getMarkdownTableSource(
            contentRef.current,
            contextMenu.startLine,
            contextMenu.endLine
        );

        if (!source) {
            setContextMenu(null);
            return;
        }

        const alignments = [...source.alignments];
        alignments[contextMenu.column] = alignment;
        replaceTable(
            source,
            serializeMarkdownTable(source, source.cells, alignments)
        );
        setContextMenu(null);
    }, [contentRef, contextMenu, replaceTable]);

    useEffect(() => {
        if (!contextMenu) {
            return;
        }

        const closeMenu = (event: Event) => {
            if (
                event.target instanceof Element &&
                event.target.closest('.preview-table-context-menu')
            ) {
                return;
            }
            setContextMenu(null);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setContextMenu(null);
            }
        };

        window.addEventListener('pointerdown', closeMenu);
        window.addEventListener('resize', closeMenu);
        window.addEventListener('scroll', closeMenu, true);
        window.addEventListener('keydown', closeOnEscape);

        return () => {
            window.removeEventListener('pointerdown', closeMenu);
            window.removeEventListener('resize', closeMenu);
            window.removeEventListener('scroll', closeMenu, true);
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [contextMenu]);

    const handleClick = useCallback((
        event: ReactMouseEvent<HTMLDivElement>
    ) => {
        const target = event.target;

        if (!(target instanceof Element)) {
            return;
        }

        const externalLink = target.closest<HTMLAnchorElement>(
            '.md-editor-preview a[href^="http://"], ' +
            '.md-editor-preview a[href^="https://"]'
        );

        if (externalLink) {
            event.preventDefault();
            void openExternalUrl(externalLink.href).catch(() => {
                setMessage('无法打开外部链接，请检查浏览器或系统设置');
            });
            return;
        }

        if (isReadOnly) {
            return;
        }

        const cell = target.closest('th, td');
        const table = cell?.closest('table.editable-preview-table');

        if (
            !(cell instanceof HTMLTableCellElement) ||
            !(table instanceof HTMLTableElement) ||
            activeCellRef.current?.element === cell
        ) {
            return;
        }

        const source = getMarkdownTableSource(
            contentRef.current,
            Number(table.dataset.line),
            Number(table.dataset.mdTableEnd)
        );
        const rowElement = cell.parentElement;

        if (!source || !(rowElement instanceof HTMLTableRowElement)) {
            return;
        }

        const row = rowElement.rowIndex;
        const column = cell.cellIndex;
        const originalValue = source.cells[row]?.[column] ?? '';

        event.preventDefault();
        activeCellRef.current = {
            element: cell,
            source,
            row,
            column,
            originalValue,
            originalHtml: cell.innerHTML
        };
        cell.textContent = originalValue;
        cell.contentEditable = 'true';
        cell.classList.add('editable-preview-table__cell--editing');
        cell.focus();

        const selection = window.getSelection();

        if (selection) {
            const range = document.createRange();
            range.selectNodeContents(cell);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }, [contentRef, isReadOnly, setMessage]);

    const handleBlur = useCallback((
        event: ReactFocusEvent<HTMLDivElement>
    ) => {
        if (event.target instanceof HTMLTableCellElement) {
            finishCellEdit(event.target);
        }
    }, [finishCellEdit]);

    const handlePaste = useCallback((
        event: ReactClipboardEvent<HTMLDivElement>
    ) => {
        const target = event.target;

        if (
            !(target instanceof HTMLTableCellElement) ||
            target.contentEditable !== 'true'
        ) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        const markdownLink = convertPastedHtmlLinksToMarkdown(
            event.clipboardData.getData('text/html')
        );
        const value = markdownLink ??
            event.clipboardData.getData('text/plain');

        if (value) {
            insertTextAtSelection(target, value);
        }
    }, []);

    const moveCaret = useCallback((
        currentCell: HTMLTableCellElement,
        targetRow: number,
        targetColumn: number,
        caretOffset: number | 'start' | 'end'
    ) => {
        const currentTable = currentCell.closest(
            'table.editable-preview-table'
        );
        const tableStartLine = currentTable?.getAttribute('data-line');

        if (!tableStartLine) {
            return;
        }

        finishCellEdit(currentCell);
        window.setTimeout(() => {
            const editorRoot = document.getElementById(
                `markdown-editor-${documentId}`
            );
            const refreshedTable = editorRoot?.querySelector<
                HTMLTableElement
            >(
                `table.editable-preview-table[data-line="${tableStartLine}"]`
            );
            const refreshedCell = refreshedTable
                ?.rows[targetRow]
                ?.cells[targetColumn];

            if (!refreshedCell) {
                return;
            }

            refreshedCell.click();
            const selection = window.getSelection();
            const textNode = refreshedCell.firstChild;

            if (!selection || !textNode) {
                return;
            }

            const textLength = textNode.textContent?.length ?? 0;
            const nextOffset = caretOffset === 'start'
                ? 0
                : caretOffset === 'end'
                    ? textLength
                    : Math.min(caretOffset, textLength);
            const range = document.createRange();
            range.setStart(textNode, nextOffset);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
        }, 140);
    }, [documentId, finishCellEdit]);

    const handleKeyDown = useCallback((
        event: ReactKeyboardEvent<HTMLDivElement>
    ) => {
        if (
            !(event.target instanceof HTMLTableCellElement) ||
            event.target.contentEditable !== 'true'
        ) {
            return;
        }

        const currentCell = event.target;
        const currentRow = currentCell.parentElement;
        const currentTable = currentCell.closest(
            'table.editable-preview-table'
        );

        if (
            event.altKey &&
            ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
                .includes(event.key)
        ) {
            event.preventDefault();
            event.stopPropagation();

            if (
                !(currentRow instanceof HTMLTableRowElement) ||
                !(currentTable instanceof HTMLTableElement)
            ) {
                return;
            }

            const row = currentRow.rowIndex;
            const column = currentCell.cellIndex;
            const operations: Record<string, PreviewTableOperation> = {
                ArrowUp: 'move-row-up',
                ArrowDown: 'move-row-down',
                ArrowLeft: 'move-column-left',
                ArrowRight: 'move-column-right'
            };
            const targetRow = event.key === 'ArrowUp'
                ? row - 1
                : event.key === 'ArrowDown'
                    ? row + 1
                    : row;
            const targetColumn = event.key === 'ArrowLeft'
                ? column - 1
                : event.key === 'ArrowRight'
                    ? column + 1
                    : column;

            if (
                targetRow < 0 ||
                targetRow >= currentTable.rows.length ||
                targetColumn < 0 ||
                targetColumn >= currentTable.rows[row].cells.length
            ) {
                return;
            }

            const startLine = Number(currentTable.dataset.line);
            const endLine = Number(currentTable.dataset.mdTableEnd);
            finishCellEdit(currentCell);
            const source = getMarkdownTableSource(
                contentRef.current,
                startLine,
                endLine
            );

            if (!source) {
                return;
            }

            replaceTable(
                source,
                operateMarkdownTable(
                    source,
                    row,
                    column,
                    operations[event.key]
                )
            );
            moveCaret(
                currentCell,
                targetRow,
                targetColumn,
                'end'
            );
            return;
        }

        if (
            ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
                .includes(event.key)
        ) {
            if (
                !(currentRow instanceof HTMLTableRowElement) ||
                !(currentTable instanceof HTMLTableElement)
            ) {
                return;
            }

            const selection = window.getSelection();

            if (!selection?.isCollapsed) {
                return;
            }

            const caretRange = selection.getRangeAt(0).cloneRange();
            caretRange.selectNodeContents(currentCell);
            caretRange.setEnd(
                selection.anchorNode ?? currentCell,
                selection.anchorOffset
            );
            const caretOffset = caretRange.toString().length;
            const textLength = currentCell.innerText.length;
            const rows = currentTable.rows;
            let targetRow = currentRow.rowIndex;
            let targetColumn = currentCell.cellIndex;
            let targetCaret: number | 'start' | 'end' = caretOffset;

            if (event.key === 'ArrowUp') {
                targetRow -= 1;
            } else if (event.key === 'ArrowDown') {
                targetRow += 1;
            } else {
                const cells = Array.from(
                    currentTable.querySelectorAll<
                        HTMLTableCellElement
                    >('th, td')
                );
                const currentIndex = cells.indexOf(currentCell);

                if (event.key === 'ArrowLeft' && caretOffset === 0) {
                    const previousCell = cells[currentIndex - 1];

                    if (!previousCell) {
                        return;
                    }
                    targetRow = (
                        previousCell.parentElement as HTMLTableRowElement
                    ).rowIndex;
                    targetColumn = previousCell.cellIndex;
                    targetCaret = 'end';
                } else if (
                    event.key === 'ArrowRight' &&
                    caretOffset === textLength
                ) {
                    const nextCell = cells[currentIndex + 1];

                    if (!nextCell) {
                        return;
                    }
                    targetRow = (
                        nextCell.parentElement as HTMLTableRowElement
                    ).rowIndex;
                    targetColumn = nextCell.cellIndex;
                    targetCaret = 'start';
                } else {
                    return;
                }
            }

            if (
                targetRow < 0 ||
                targetRow >= rows.length ||
                !rows[targetRow]?.cells[targetColumn]
            ) {
                return;
            }

            event.preventDefault();
            moveCaret(
                currentCell,
                targetRow,
                targetColumn,
                targetCaret
            );
            return;
        }

        if (event.key === 'Tab') {
            event.preventDefault();

            if (
                !(currentRow instanceof HTMLTableRowElement) ||
                !(currentTable instanceof HTMLTableElement)
            ) {
                return;
            }

            const cells = Array.from(
                currentTable.querySelectorAll<HTMLTableCellElement>(
                    'th, td'
                )
            );
            const currentIndex = cells.indexOf(currentCell);
            const nextCell = cells[
                event.shiftKey ? currentIndex - 1 : currentIndex + 1
            ];
            const tableStartLine = currentTable.dataset.line;
            const nextRowIndex =
                nextCell?.parentElement instanceof HTMLTableRowElement
                    ? nextCell.parentElement.rowIndex
                    : -1;
            const nextColumnIndex = nextCell?.cellIndex ?? -1;
            finishCellEdit(currentCell);

            if (
                !tableStartLine ||
                nextRowIndex < 0 ||
                nextColumnIndex < 0
            ) {
                return;
            }

            window.setTimeout(() => {
                const editorRoot = document.getElementById(
                    `markdown-editor-${documentId}`
                );
                const refreshedTable = editorRoot?.querySelector<
                    HTMLTableElement
                >(
                    `table.editable-preview-table[data-line="${tableStartLine}"]`
                );
                refreshedTable
                    ?.rows[nextRowIndex]
                    ?.cells[nextColumnIndex]
                    ?.click();
            }, 140);
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            currentCell.blur();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            finishCellEdit(currentCell, true);
            currentCell.blur();
        }
    }, [
        contentRef,
        documentId,
        finishCellEdit,
        moveCaret,
        replaceTable
    ]);

    const contextMenuTable = contextMenu
        ? getMarkdownTableSource(
            contentRef.current,
            contextMenu.startLine,
            contextMenu.endLine
        )
        : null;
    const contextMenuAlignment = contextMenu && contextMenuTable
        ? contextMenuTable.alignments[contextMenu.column]
        : null;

    return {
        activeCellRef,
        contextMenu,
        contextMenuTable,
        contextMenuAlignment,
        finishCellEdit,
        applyOperation,
        applyAlignment,
        handlers: {
            onClick: handleClick,
            onBlurCapture: handleBlur,
            onPasteCapture: handlePaste,
            onKeyDownCapture: handleKeyDown,
            onContextMenu: handleContextMenu
        }
    };
}
