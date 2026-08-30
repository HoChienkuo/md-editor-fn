import {useCallback, useEffect, useRef, useState} from 'react';
import type {
    Dispatch,
    MouseEvent as ReactMouseEvent,
    PointerEvent as ReactPointerEvent,
    RefObject,
    SetStateAction
} from 'react';
import type {ExposeParam} from 'md-editor-rt';
import {redo, undo} from '@codemirror/commands';

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
import {applyMarkdownFormat} from './markdown-format';
import type {MarkdownFormatCommand} from './markdown-format';

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
    selectionStart: number;
    selectionEnd: number;
    selectionRevision: number;
    undoStack: PreviewTableCellSnapshot[];
    redoStack: PreviewTableCellSnapshot[];
};

type PreviewTableCellSnapshot = {
    value: string;
    selectionStart: number;
    selectionEnd: number;
};

export type PreviewTableToolbarState = {
    table: HTMLTableElement;
    startLine: number;
    endLine: number;
    row: number;
    column: number;
    top: number;
    left: number;
    alignment: MarkdownTableAlignment;
    columnCount: number;
    rowCount: number;
};

type StringRef = {current: string};

type ScrollPosition = {
    element: HTMLElement;
    top: number;
    left: number;
};

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

function getToolbarPosition(table: HTMLTableElement) {
    const previewScroller = table.closest<HTMLElement>(
        '.md-editor-preview-wrapper'
    );
    const rect = table.getBoundingClientRect();

    if (!previewScroller) {
        return {
            top: rect.top,
            left: rect.left
        };
    }

    const scrollerRect = previewScroller.getBoundingClientRect();
    const tableTop =
        rect.top - scrollerRect.top + previewScroller.scrollTop;
    const tableLeft =
        rect.left - scrollerRect.left + previewScroller.scrollLeft;
    const toolbarWidth = Math.min(
        560,
        Math.max(0, previewScroller.clientWidth - 16)
    );
    const minimumLeft = previewScroller.scrollLeft + 8;
    const maximumLeft =
        previewScroller.scrollLeft +
        previewScroller.clientWidth -
        toolbarWidth -
        8;

    return {
        top: tableTop - 42,
        left: Math.max(
            minimumLeft,
            Math.min(tableLeft, maximumLeft)
        )
    };
}

function captureEditorScrollPositions(editorRoot: HTMLElement) {
    return Array.from(
        editorRoot.querySelectorAll<HTMLElement>(
            '.md-editor-preview-wrapper, .cm-scroller'
        )
    ).map<ScrollPosition>((element) => ({
        element,
        top: element.scrollTop,
        left: element.scrollLeft
    }));
}

function restoreEditorScrollPositions(positions: ScrollPosition[]) {
    positions.forEach(({element, top, left}) => {
        if (element.isConnected) {
            element.scrollTo({top, left, behavior: 'auto'});
        }
    });
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
    const [toolbar, setToolbar] =
        useState<PreviewTableToolbarState | null>(null);
    const toolbarLeaveTimerRef = useRef<number | null>(null);
    const historyViewportRevisionRef = useRef(0);

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
        if (window.matchMedia('(pointer: coarse)').matches) {
            setToolbar(null);
        }
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

    const updateCellValue = useCallback((
        value: string,
        selectionStart?: number,
        selectionEnd?: number
    ) => {
        const active = activeCellRef.current;

        if (!active) {
            return;
        }

        const nextActive = {
            ...active,
            value,
            selectionStart: selectionStart ?? active.selectionStart,
            selectionEnd: selectionEnd ?? active.selectionEnd,
            undoStack: [
                ...active.undoStack,
                {
                    value: active.value,
                    selectionStart: active.selectionStart,
                    selectionEnd: active.selectionEnd
                }
            ],
            redoStack: []
        };
        activeCellRef.current = nextActive;
        setCellEditor(nextActive);
    }, []);

    const runCellHistory = useCallback((direction: 'undo' | 'redo') => {
        const active = activeCellRef.current;

        if (!active) {
            return;
        }

        const sourceStack = direction === 'undo'
            ? active.undoStack
            : active.redoStack;
        const snapshot = sourceStack[sourceStack.length - 1];

        if (!snapshot) {
            return;
        }

        const currentSnapshot = {
            value: active.value,
            selectionStart: active.selectionStart,
            selectionEnd: active.selectionEnd
        };
        const nextActive = {
            ...active,
            ...snapshot,
            selectionRevision: active.selectionRevision + 1,
            undoStack: direction === 'undo'
                ? sourceStack.slice(0, -1)
                : [...active.undoStack, currentSnapshot],
            redoStack: direction === 'redo'
                ? sourceStack.slice(0, -1)
                : [...active.redoStack, currentSnapshot]
        };
        activeCellRef.current = nextActive;
        setCellEditor(nextActive);
    }, []);

    const updateCellSelection = useCallback((
        selectionStart: number,
        selectionEnd: number
    ) => {
        const active = activeCellRef.current;

        if (active) {
            activeCellRef.current = {
                ...active,
                selectionStart,
                selectionEnd
            };
        }
    }, []);

    const applyCellFormat = useCallback((
        command: MarkdownFormatCommand
    ) => {
        const active = activeCellRef.current;

        if (!active) {
            return;
        }

        const result = applyMarkdownFormat(
            active.value,
            active.selectionStart,
            active.selectionEnd,
            command
        );
        const nextActive = {
            ...active,
            value: result.value,
            selectionStart: result.selectionStart,
            selectionEnd: result.selectionEnd,
            selectionRevision: active.selectionRevision + 1,
            undoStack: [
                ...active.undoStack,
                {
                    value: active.value,
                    selectionStart: active.selectionStart,
                    selectionEnd: active.selectionEnd
                }
            ],
            redoStack: []
        };
        activeCellRef.current = nextActive;
        setCellEditor(nextActive);
    }, []);

    const insertCellText = useCallback((text: string) => {
        const active = activeCellRef.current;

        if (!active) {
            return;
        }

        const start = Math.min(
            active.selectionStart,
            active.selectionEnd
        );
        const end = Math.max(
            active.selectionStart,
            active.selectionEnd
        );
        const nextPosition = start + text.length;
        const nextActive = {
            ...active,
            value:
                active.value.slice(0, start) +
                text +
                active.value.slice(end),
            selectionStart: nextPosition,
            selectionEnd: nextPosition,
            selectionRevision: active.selectionRevision + 1,
            undoStack: [
                ...active.undoStack,
                {
                    value: active.value,
                    selectionStart: active.selectionStart,
                    selectionEnd: active.selectionEnd
                }
            ],
            redoStack: []
        };
        activeCellRef.current = nextActive;
        setCellEditor(nextActive);
    }, []);

    const runDocumentHistory = useCallback((direction: 'undo' | 'redo') => {
        const active = activeCellRef.current;
        const editorRoot = document.getElementById(
            `markdown-editor-${documentId}`
        );
        const anchorTable = active?.element.closest<HTMLTableElement>(
            'table.editable-preview-table'
        ) ?? toolbar?.table ?? null;
        const anchorStartLine = anchorTable?.dataset.line;
        const anchorTop = anchorTable?.getBoundingClientRect().top;
        const scrollPositions = editorRoot
            ? captureEditorScrollPositions(editorRoot)
            : [];
        const windowScrollX = window.scrollX;
        const windowScrollY = window.scrollY;
        const revision = historyViewportRevisionRef.current + 1;
        historyViewportRevisionRef.current = revision;

        if (active) {
            finishCellEdit(active.element);
        }

        const editorView = editorRef.current?.getEditorView();

        if (editorView) {
            (direction === 'undo' ? undo : redo)(editorView);
        }

        const restoreViewport = () => {
            if (historyViewportRevisionRef.current !== revision) {
                return;
            }

            restoreEditorScrollPositions(scrollPositions);
            window.scrollTo({
                left: windowScrollX,
                top: windowScrollY,
                behavior: 'auto'
            });

            if (
                editorRoot &&
                anchorStartLine !== undefined &&
                anchorTop !== undefined
            ) {
                const refreshedTable = editorRoot.querySelector<
                    HTMLTableElement
                >(
                    `table.editable-preview-table[data-line="${anchorStartLine}"]`
                );
                const previewScroller = refreshedTable?.closest<HTMLElement>(
                    '.md-editor-preview-wrapper'
                );

                if (refreshedTable && previewScroller) {
                    previewScroller.scrollTop +=
                        refreshedTable.getBoundingClientRect().top -
                        anchorTop;
                }
            }
        };

        window.requestAnimationFrame(restoreViewport);
        window.setTimeout(restoreViewport, 120);
        window.setTimeout(restoreViewport, 240);
    }, [documentId, editorRef, finishCellEdit, toolbar]);

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
            selectionStart: originalValue.length,
            selectionEnd: originalValue.length,
            selectionRevision: 0,
            undoStack: [],
            redoStack: [],
            ...getCellPosition(cell)
        };

        activeCellRef.current = nextActive;
        setCellEditor(nextActive);
        setToolbar({
            table,
            startLine,
            endLine,
            row,
            column,
            alignment: source.alignments[column] ?? null,
            columnCount: source.alignments.length,
            rowCount: source.cells.length,
            ...getToolbarPosition(table)
        });
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

    const handlePointerOver = useCallback((
        event: ReactPointerEvent<HTMLDivElement>
    ) => {
        if (isReadOnly || activeCellRef.current) {
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

        if (toolbarLeaveTimerRef.current !== null) {
            window.clearTimeout(toolbarLeaveTimerRef.current);
        }

        const source = getMarkdownTableSource(
            contentRef.current,
            Number(table.dataset.line),
            Number(table.dataset.mdTableEnd)
        );

        if (!source) {
            return;
        }

        setToolbar({
            table,
            startLine: Number(table.dataset.line),
            endLine: Number(table.dataset.mdTableEnd),
            row: row.rowIndex,
            column: cell.cellIndex,
            alignment: source.alignments[cell.cellIndex] ?? null,
            columnCount: source.alignments.length,
            rowCount: source.cells.length,
            ...getToolbarPosition(table)
        });
    }, [contentRef, isReadOnly]);

    const handlePointerOut = useCallback((
        event: ReactPointerEvent<HTMLDivElement>
    ) => {
        if (activeCellRef.current) {
            return;
        }

        const related = event.relatedTarget;

        if (
            related instanceof Element &&
            related.closest('table.editable-preview-table')
        ) {
            return;
        }

        toolbarLeaveTimerRef.current = window.setTimeout(() => {
            if (!activeCellRef.current) {
                setToolbar(null);
            }
        }, 150);
    }, []);

    const handleToolbarPointerEnter = useCallback(() => {
        if (toolbarLeaveTimerRef.current !== null) {
            window.clearTimeout(toolbarLeaveTimerRef.current);
        }
    }, []);

    const handleToolbarPointerLeave = useCallback(() => {
        if (!activeCellRef.current) {
            setToolbar(null);
        }
    }, []);

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

    const moveActiveCell = useCallback((
        operation: PreviewTableOperation
    ) => {
        const active = activeCellRef.current;

        if (!active) {
            return;
        }

        const isRowMove = operation === 'move-row-up' ||
            operation === 'move-row-down';
        const rowOffset = operation === 'move-row-up'
            ? -1
            : operation === 'move-row-down'
                ? 1
                : 0;
        const columnOffset = operation === 'move-column-left'
            ? -1
            : operation === 'move-column-right'
                ? 1
                : 0;
        const targetRow = active.row + rowOffset;
        const targetColumn = active.column + columnOffset;
        const rowCount = active.source.cells.length;
        const columnCount = active.source.alignments.length;

        if (
            (!isRowMove && columnOffset === 0) ||
            targetRow < 0 ||
            targetRow >= rowCount ||
            targetColumn < 0 ||
            targetColumn >= columnCount
        ) {
            return;
        }

        const nextCells = active.source.cells.map((row) => [...row]);
        nextCells[active.row][active.column] = active.value
            .replace(/\r?\n/g, ' ')
            .trim();
        const sourceWithEditedCell = {
            ...active.source,
            cells: nextCells
        };

        activeCellRef.current = null;
        setCellEditor(null);
        setToolbar(null);
        active.element.classList.remove(
            'editable-preview-table__cell--editing'
        );
        replaceTable(
            sourceWithEditedCell,
            operateMarkdownTable(
                sourceWithEditedCell,
                active.row,
                active.column,
                operation
            )
        );

        window.setTimeout(() => {
            const editorRoot = document.getElementById(
                `markdown-editor-${documentId}`
            );
            const refreshedTable = editorRoot?.querySelector<
                HTMLTableElement
            >(
                `table.editable-preview-table[data-line="${active.startLine}"]`
            );
            const refreshedCell = refreshedTable
                ?.rows[targetRow]
                ?.cells[targetColumn];

            if (refreshedCell && refreshedTable) {
                openCellEditor(refreshedCell, refreshedTable);
            }
        }, 140);
    }, [documentId, openCellEditor, replaceTable]);

    useEffect(() => {
        if (!toolbar) {
            return;
        }

        const updatePosition = () => {
            setToolbar((current) => {
                if (!current || !current.table.isConnected) {
                    return null;
                }

                return {
                    ...current,
                    ...getToolbarPosition(current.table)
                };
            });
        };

        window.addEventListener('resize', updatePosition);

        return () => {
            window.removeEventListener('resize', updatePosition);
        };
    }, [toolbar?.table]);

    useEffect(() => {
        return () => {
            if (toolbarLeaveTimerRef.current !== null) {
                window.clearTimeout(toolbarLeaveTimerRef.current);
            }
        };
    }, []);

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
        updateCellSelection,
        applyCellFormat,
        insertCellText,
        undoCellEdit: () => runCellHistory('undo'),
        redoCellEdit: () => runCellHistory('redo'),
        undoDocument: () => runDocumentHistory('undo'),
        redoDocument: () => runDocumentHistory('redo'),
        finishCellEdit,
        commitCellEdit,
        cancelCellEdit,
        moveToAdjacentCell,
        moveActiveCell,
        openActiveContextMenu,
        toolbar,
        handleToolbarPointerEnter,
        handleToolbarPointerLeave,
        contextMenu,
        contextMenuTable,
        contextMenuAlignment,
        applyOperation,
        applyAlignment,
        handlers: {
            onClick: handleClick,
            onContextMenu: handleContextMenu,
            onPointerOver: handlePointerOver,
            onPointerOut: handlePointerOut
        }
    };
}
