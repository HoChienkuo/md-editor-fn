import {useCallback, useEffect, useRef, useState} from 'react';
import type {
    Dispatch,
    MouseEvent as ReactMouseEvent,
    RefObject,
    SetStateAction
} from 'react';
import type {ExposeParam} from 'md-editor-rt';

import {openExternalUrl} from '../../../services/fnos-sdk';
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
import type {PreviewTableContextMenu} from './TableContextMenu';

export type PreviewTableCellEditorState = {
    element: HTMLTableCellElement;
    source: MarkdownTableSource;
    row: number;
    column: number;
    startLine: number;
    endLine: number;
    originalValue: string;
    value: string;
    top: number;
    left: number;
    width: number;
    height: number;
};

type StringRef = {current: string};

type UsePreviewTableOptions = {
    editorRef: RefObject<ExposeParam | null>;
    documentId: string;
    isReadOnly: boolean;
    contentRef: StringRef;
    onContentChange: (content: string) => void;
    setMessage: Dispatch<SetStateAction<string>>;
};

function getCellPosition(cell: HTMLTableCellElement) {
    const rect = cell.getBoundingClientRect();

    return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height
    };
}

export function usePreviewTable({
    editorRef,
    documentId,
    isReadOnly,
    contentRef,
    onContentChange,
    setMessage
}: UsePreviewTableOptions) {
    const activeCellRef =
        useRef<PreviewTableCellEditorState | null>(null);
    const [cellEditor, setCellEditor] =
        useState<PreviewTableCellEditorState | null>(null);
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
        setCellEditor(null);
        cell.classList.remove(
            'editable-preview-table__cell--editing'
        );
        const nextValue = active.value
            .replace(/\r?\n/g, ' ')
            .trim();

        if (cancel || nextValue === active.originalValue) {
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

    const updateCellValue = useCallback((value: string) => {
        const active = activeCellRef.current;

        if (!active) {
            return;
        }

        const nextActive = {...active, value};
        activeCellRef.current = nextActive;
        setCellEditor(nextActive);
    }, []);

    const commitCellEdit = useCallback(() => {
        const active = activeCellRef.current;

        if (active) {
            finishCellEdit(active.element);
        }
    }, [finishCellEdit]);

    const cancelCellEdit = useCallback(() => {
        const active = activeCellRef.current;

        if (active) {
            finishCellEdit(active.element, true);
        }
    }, [finishCellEdit]);

    const openCellEditor = useCallback((
        cell: HTMLTableCellElement,
        table: HTMLTableElement
    ) => {
        if (activeCellRef.current?.element === cell) {
            return;
        }

        const startLine = Number(table.dataset.line);
        const endLine = Number(table.dataset.mdTableEnd);
        const source = getMarkdownTableSource(
            contentRef.current,
            startLine,
            endLine
        );
        const rowElement = cell.parentElement;

        if (!source || !(rowElement instanceof HTMLTableRowElement)) {
            return;
        }

        const row = rowElement.rowIndex;
        const column = cell.cellIndex;
        const originalValue = source.cells[row]?.[column] ?? '';
        const nextActive: PreviewTableCellEditorState = {
            element: cell,
            source,
            row,
            column,
            startLine,
            endLine,
            originalValue,
            value: originalValue,
            ...getCellPosition(cell)
        };

        activeCellRef.current = nextActive;
        setCellEditor(nextActive);
        cell.classList.add(
            'editable-preview-table__cell--editing'
        );
    }, [contentRef]);

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
            !(table instanceof HTMLTableElement)
        ) {
            return;
        }

        event.preventDefault();
        openCellEditor(cell, table);
    }, [isReadOnly, openCellEditor, setMessage]);

    const moveToAdjacentCell = useCallback((backwards: boolean) => {
        const active = activeCellRef.current;

        if (!active) {
            return;
        }

        const currentTable = active.element.closest(
            'table.editable-preview-table'
        );

        if (!(currentTable instanceof HTMLTableElement)) {
            finishCellEdit(active.element);
            return;
        }

        const cells = Array.from(
            currentTable.querySelectorAll<HTMLTableCellElement>(
                'th, td'
            )
        );
        const currentIndex = cells.indexOf(active.element);
        const nextCell = cells[
            backwards ? currentIndex - 1 : currentIndex + 1
        ];
        const tableStartLine = currentTable.dataset.line;
        const nextRow = nextCell?.parentElement instanceof
            HTMLTableRowElement
            ? nextCell.parentElement.rowIndex
            : -1;
        const nextColumn = nextCell?.cellIndex ?? -1;

        finishCellEdit(active.element);

        if (!tableStartLine || nextRow < 0 || nextColumn < 0) {
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
            const refreshedCell = refreshedTable
                ?.rows[nextRow]
                ?.cells[nextColumn];

            if (refreshedCell && refreshedTable) {
                openCellEditor(refreshedCell, refreshedTable);
            }
        }, 140);
    }, [documentId, finishCellEdit, openCellEditor]);

    useEffect(() => {
        if (!cellEditor) {
            return;
        }

        const updatePosition = () => {
            const active = activeCellRef.current;

            if (!active || !active.element.isConnected) {
                return;
            }

            const nextActive = {
                ...active,
                ...getCellPosition(active.element)
            };
            activeCellRef.current = nextActive;
            setCellEditor(nextActive);
        };

        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [cellEditor?.element]);

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

    const openActiveContextMenu = useCallback((
        clientX: number,
        clientY: number
    ) => {
        const active = activeCellRef.current;

        if (!active) {
            return;
        }

        finishCellEdit(active.element);
        setContextMenu({
            left: Math.max(
                8,
                Math.min(clientX, window.innerWidth - 232)
            ),
            top: Math.max(
                8,
                Math.min(clientY, window.innerHeight - 446)
            ),
            startLine: active.startLine,
            endLine: active.endLine,
            row: active.row,
            column: active.column
        });
    }, [finishCellEdit]);

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
        cellEditor,
        updateCellValue,
        finishCellEdit,
        commitCellEdit,
        cancelCellEdit,
        moveToAdjacentCell,
        openActiveContextMenu,
        contextMenu,
        contextMenuTable,
        contextMenuAlignment,
        applyOperation,
        applyAlignment,
        handlers: {
            onClick: handleClick,
            onContextMenu: handleContextMenu
        }
    };
}
