import {
    useCallback,
    useEffect,
    useRef,
    useState
} from 'react';
import type {
    FocusEvent as ReactFocusEvent,
    KeyboardEvent as ReactKeyboardEvent,
    MouseEvent as ReactMouseEvent
} from 'react';
import {
    allToolbar,
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
    ExposeParam,
    UploadImgCallBackParam,
    UploadImgEvent
} from 'md-editor-rt';
import {
    saveDocument
} from '../services/document-api';

import type {
    DocumentVersion,
    OpenedDocument
} from '../services/document-api';
import {
    uploadAsset
} from '../services/asset-api';

import type {
    UploadedAsset
} from '../services/asset-api';
import {
    ApiRequestError
} from '../services/api-client';
import {
    useColorTheme
} from '../hooks/use-color-theme';
import {
    useUnsavedChanges
} from '../hooks/use-unsaved-changes';
import {
    useMobileLayout
} from '../hooks/use-mobile-layout';

const taskToolbarIndex =
    allToolbar.indexOf('task');

const saveToolbarIndex =
    allToolbar.indexOf('save');

const rightToolbarIndex =
    allToolbar.indexOf('=');

const editorToolbars = [
    ...allToolbar.slice(
        0,
        taskToolbarIndex + 1
    ),
    0,
    1,
    ...allToolbar.slice(
        taskToolbarIndex + 1,
        saveToolbarIndex + 1
    ),
    2,
    ...allToolbar.slice(
        saveToolbarIndex + 1,
        rightToolbarIndex + 1
    ),
    3,
    ...allToolbar.slice(
        rightToolbarIndex + 1
    )
];

interface MarkdownDocumentEditorProps {
    openedDocument: OpenedDocument;
}

function getEditorLanguage(): 'zh-CN' | 'en-US' {
    const language = navigator.language.toLowerCase();

    return language.startsWith('zh')
        ? 'zh-CN'
        : 'en-US';
}

type InsertedImage = {
    url: string;
    alt: string;
    title: string;
};

type MarkdownTableSource = {
    from: number;
    to: number;
    lineEnding: string;
    trailingLineEnding: string;
    lines: string[];
    cells: string[][];
    alignments: MarkdownTableAlignment[];
};

type MarkdownTableAlignment =
    'left' | 'center' | 'right' | null;

type PreviewTableContextMenu = {
    left: number;
    top: number;
    startLine: number;
    endLine: number;
    row: number;
    column: number;
};

type PreviewTableOperation =
    | 'insert-row-above'
    | 'insert-row-below'
    | 'insert-column-left'
    | 'insert-column-right'
    | 'move-row-up'
    | 'move-row-down'
    | 'move-column-left'
    | 'move-column-right'
    | 'delete-row'
    | 'delete-column';

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

type ActivePreviewTableCell = {
    element: HTMLTableCellElement;
    source: MarkdownTableSource;
    row: number;
    column: number;
    originalValue: string;
    originalHtml: string;
};

function splitMarkdownTableRow(
    line: string
): string[] {
    const value = line.trim();
    const cells: string[] = [];
    let cell = '';
    let backtickFence = 0;

    for (let index = 0; index < value.length;) {
        const character = value[index];

        if (character === '`') {
            let fenceLength = 1;

            while (
                value[index + fenceLength] === '`'
            ) {
                fenceLength += 1;
            }

            if (backtickFence === 0) {
                backtickFence = fenceLength;
            } else if (backtickFence === fenceLength) {
                backtickFence = 0;
            }

            cell += value.slice(
                index,
                index + fenceLength
            );
            index += fenceLength;
            continue;
        }

        const previousBackslashes = (() => {
            let count = 0;

            for (
                let cursor = index - 1;
                cursor >= 0 && value[cursor] === '\\';
                cursor -= 1
            ) {
                count += 1;
            }

            return count;
        })();

        if (
            character === '|' &&
            backtickFence === 0 &&
            previousBackslashes % 2 === 0
        ) {
            cells.push(cell.trim());
            cell = '';
        } else {
            cell += character;
        }

        index += 1;
    }

    cells.push(cell.trim());

    if (cells[0] === '') {
        cells.shift();
    }

    if (cells.at(-1) === '') {
        cells.pop();
    }

    return cells;
}

function getMarkdownTableSource(
    markdown: string,
    startLine: number,
    endLine: number
): MarkdownTableSource | null {
    const lineStarts = [0];

    for (let index = 0; index < markdown.length; index += 1) {
        if (markdown[index] === '\n') {
            lineStarts.push(index + 1);
        }
    }

    if (
        startLine < 0 ||
        endLine <= startLine ||
        startLine >= lineStarts.length
    ) {
        return null;
    }

    const from = lineStarts[startLine];
    const to = endLine < lineStarts.length
        ? lineStarts[endLine]
        : markdown.length;
    const sourceText = markdown.slice(from, to);
    const trailingLineEnding = sourceText.endsWith('\r\n')
        ? '\r\n'
        : sourceText.endsWith('\n')
            ? '\n'
            : '';
    const tableText = trailingLineEnding
        ? sourceText.slice(
            0,
            -trailingLineEnding.length
        )
        : sourceText;
    const lines = tableText.split(/\r?\n/);

    if (lines.length < 2) {
        return null;
    }

    const delimiterCells =
        splitMarkdownTableRow(lines[1]);
    const parsedCells = [
        splitMarkdownTableRow(lines[0]),
        ...lines.slice(2).map(
            splitMarkdownTableRow
        )
    ];
    const columnCount = Math.max(
        delimiterCells.length,
        ...parsedCells.map((cells) => cells.length)
    );
    const cells = parsedCells.map((row) => {
        return Array.from(
            {length: columnCount},
            (_, column) => row[column] ?? ''
        );
    });
    const alignments = Array.from(
        {length: columnCount},
        (_, column): MarkdownTableAlignment => {
            const delimiter =
                delimiterCells[column]?.trim() ?? '';
            const left = delimiter.startsWith(':');
            const right = delimiter.endsWith(':');

            if (left && right) {
                return 'center';
            }

            if (left) {
                return 'left';
            }

            if (right) {
                return 'right';
            }

            return null;
        }
    );

    return {
        from,
        to,
        lineEnding: tableText.includes('\r\n')
            ? '\r\n'
            : '\n',
        trailingLineEnding,
        lines,
        cells,
        alignments
    };
}

function escapeMarkdownTableCell(
    value: string
): string {
    return value
        .replace(/\r?\n/g, '<br>')
        .replace(/(^|[^\\])\|/g, '$1\\|')
        .trim();
}

function serializeMarkdownTable(
    source: MarkdownTableSource,
    cells: string[][],
    alignments = source.alignments
): string {
    const serializeRow = (cells: string[]) => {
        return `| ${cells
            .map(escapeMarkdownTableCell)
            .join(' | ')} |`;
    };
    const delimiter = alignments.map((alignment) => {
        switch (alignment) {
            case 'left':
                return ':---';

            case 'center':
                return ':---:';

            case 'right':
                return '---:';

            default:
                return '---';
        }
    });

    return [
        serializeRow(cells[0]),
        serializeRow(delimiter),
        ...cells.slice(1).map(serializeRow)
    ].join(source.lineEnding) +
        source.trailingLineEnding;
}

function updateMarkdownTableCell(
    source: MarkdownTableSource,
    row: number,
    column: number,
    value: string
): string {
    const nextCells = source.cells.map(
        (cells) => [...cells]
    );
    const targetRow = nextCells[row];

    if (!targetRow) {
        return source.lines.join(source.lineEnding);
    }

    targetRow[column] = value;

    return serializeMarkdownTable(
        source,
        nextCells
    );
}

function operateMarkdownTable(
    source: MarkdownTableSource,
    rowIndex: number,
    columnIndex: number,
    operation: PreviewTableOperation
): string {
    const cells = source.cells.map((row) => [...row]);
    const alignments = [...source.alignments];
    const columnCount = alignments.length;
    const emptyRow = () =>
        Array.from({length: columnCount}, () => '');

    switch (operation) {
        case 'insert-row-above':
            cells.splice(rowIndex, 0, emptyRow());
            break;

        case 'insert-row-below':
            cells.splice(rowIndex + 1, 0, emptyRow());
            break;

        case 'insert-column-left':
        case 'insert-column-right': {
            const offset = operation ===
            'insert-column-right' ? 1 : 0;
            const index = columnIndex + offset;

            cells.forEach((row) => row.splice(index, 0, ''));
            alignments.splice(index, 0, null);
            break;
        }

        case 'move-row-up':
            if (rowIndex > 0) {
                [cells[rowIndex - 1], cells[rowIndex]] =
                    [cells[rowIndex], cells[rowIndex - 1]];
            }
            break;

        case 'move-row-down':
            if (rowIndex < cells.length - 1) {
                [cells[rowIndex], cells[rowIndex + 1]] =
                    [cells[rowIndex + 1], cells[rowIndex]];
            }
            break;

        case 'move-column-left':
            if (columnIndex > 0) {
                cells.forEach((row) => {
                    [row[columnIndex - 1], row[columnIndex]] =
                        [row[columnIndex], row[columnIndex - 1]];
                });
                [alignments[columnIndex - 1], alignments[columnIndex]] =
                    [alignments[columnIndex], alignments[columnIndex - 1]];
            }
            break;

        case 'move-column-right':
            if (columnIndex < columnCount - 1) {
                cells.forEach((row) => {
                    [row[columnIndex], row[columnIndex + 1]] =
                        [row[columnIndex + 1], row[columnIndex]];
                });
                [alignments[columnIndex], alignments[columnIndex + 1]] =
                    [alignments[columnIndex + 1], alignments[columnIndex]];
            }
            break;

        case 'delete-row':
            if (cells.length > 1) {
                cells.splice(rowIndex, 1);
            } else {
                cells[0] = emptyRow();
            }
            break;

        case 'delete-column':
            if (columnCount > 1) {
                cells.forEach((row) => row.splice(columnIndex, 1));
                alignments.splice(columnIndex, 1);
            }
            break;
    }

    return serializeMarkdownTable(
        source,
        cells,
        alignments
    );
}

function createImageDescription(
    fileName: string
): string {
    const withoutExtension =
        fileName.replace(
            /\.[^.]+$/,
            ''
        );

    const sanitized = withoutExtension
        .replace(
            /[\[\]\\\r\n"]/g,
            ' '
        )
        .replace(
            /\s+/g,
            ' '
        )
        .trim()
        .slice(0, 100);

    return sanitized || '图片';
}

function toInsertedImage(
    asset: UploadedAsset
): InsertedImage {
    const description =
        createImageDescription(
            asset.originalName
        );

    return {
        url: asset.previewUrl,
        alt: description,
        title: description
    };
}

function transformInsertedImageUrl(
    imageUrl: string
): string {
    const value = imageUrl.trim();

    /*
     * 允许本应用的私有图片 URL。
     */
    if (
        value.startsWith(
            '/app/md-editor-fn/api/assets/'
        )
    ) {
        return value;
    }

    /*
     * 当前阶段只允许 HTTPS 网络图片。
     */
    try {
        const parsedUrl = new URL(value);

        if (parsedUrl.protocol === 'https:') {
            return parsedUrl.href;
        }
    } catch {
        // 相对路径和无效链接暂不支持。
    }

    return '';
}

function createImageMarkdown(
    images: InsertedImage[]
): string {
    return images
        .map((image) => {
            return (
                `![${image.alt}]` +
                `(${image.url} "${image.title}")`
            );
        })
        .join('\n\n');
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

    const initialContent = openedDocument.content;

    const [content, setContent] = useState(
        initialContent
    );

    const contentRef = useRef(initialContent);
    const savedContentRef = useRef(initialContent);

    const [
        hasUnsavedChanges,
        setHasUnsavedChanges
    ] = useState(false);

    const [contentLength, setContentLength] =
        useState(initialContent.length);

    const [
        currentVersion,
        setCurrentVersion
    ] = useState<DocumentVersion>(
        openedDocument.version
    );

    const [isSaving, setIsSaving] = useState(false);

    const [hasConflict, setHasConflict] =
        useState(false);

    const [saveMessage, setSaveMessage] = useState('');

    const isReadOnly = openedDocument.readOnly;

    const isMobileLayout =
        useMobileLayout();

    useUnsavedChanges(hasUnsavedChanges);

    useEffect(() => {
        const status = hasUnsavedChanges ? ' *' : '';

        window.document.title =
            `${openedDocument.name}${status} - Markdown 编辑器`;
    }, [
        openedDocument.name,
        hasUnsavedChanges
    ]);

    const saveCurrentContent = useCallback(
        async (
            contentToSave: string,
            mode: 'manual' | 'auto'
        ) => {
            if (isReadOnly || isSaving || hasConflict) {
                return;
            }

            if (contentToSave === savedContentRef.current) {
                if (mode === 'manual') {
                    setSaveMessage(
                        '当前没有需要保存的修改'
                    );
                }

                return;
            }

            setIsSaving(true);

            if (mode === 'manual') {
                setSaveMessage('正在保存……');
            }

            try {
                const result = await saveDocument(
                    openedDocument.documentId,
                    contentToSave,
                    currentVersion
                );

                /*
                 * 保存请求发出后，用户可能继续输入。
                 * 这里只把实际发送给后端的内容设为保存基准，
                 * 不会错误地把后来输入的内容标记为已保存。
                 */
                savedContentRef.current = contentToSave;
                setCurrentVersion(result.version);
                setHasUnsavedChanges(
                    contentRef.current !== contentToSave
                );

                setSaveMessage(
                    mode === 'auto'
                        ? '已自动保存'
                        : '保存成功'
                );
            } catch (error) {
                if (
                    error instanceof ApiRequestError &&
                    error.errorType ===
                    'DOCUMENT_CONFLICT'
                ) {
                    setHasConflict(true);
                    setSaveMessage(
                        '磁盘文件已被其他用户或程序修改。为避免覆盖，自动保存已经暂停，请先复制当前内容并重新打开文件。'
                    );

                    return;
                }

                setSaveMessage(
                    error instanceof Error
                        ? `保存失败：${error.message}`
                        : '保存失败，请稍后重试'
                );
            } finally {
                setIsSaving(false);
            }
        },
        [
            currentVersion,
            hasConflict,
            isReadOnly,
            isSaving,
            openedDocument.documentId,
        ]
    );

    const saveCurrentContentRef = useRef(
        saveCurrentContent
    );

    useEffect(() => {
        saveCurrentContentRef.current =
            saveCurrentContent;
    }, [saveCurrentContent]);

    const autoSaveTimerRef = useRef<number | null>(
        null
    );

    const lengthTimerRef = useRef<number | null>(
        null
    );

    const handleChange = useCallback(
        (nextContent: string) => {
            setContent(nextContent);
            contentRef.current = nextContent;

            setHasUnsavedChanges(
                !isReadOnly &&
                nextContent !== savedContentRef.current
            );

            if (!hasConflict) {
                setSaveMessage('');
            }

            if (lengthTimerRef.current !== null) {
                window.clearTimeout(
                    lengthTimerRef.current
                );
            }

            lengthTimerRef.current = window.setTimeout(
                () => {
                    setContentLength(
                        contentRef.current.length
                    );
                },
                300
            );

            if (autoSaveTimerRef.current !== null) {
                window.clearTimeout(
                    autoSaveTimerRef.current
                );
            }

            if (
                !isReadOnly &&
                !hasConflict &&
                nextContent !== savedContentRef.current
            ) {
                autoSaveTimerRef.current =
                    window.setTimeout(() => {
                        void saveCurrentContentRef.current(
                            contentRef.current,
                            'auto'
                        );
                    }, 60 * 1000);
            }
        },
        [
            hasConflict,
            isReadOnly
        ]
    );

    const activePreviewTableCellRef = useRef<
        ActivePreviewTableCell | null
    >(null);
    const [previewTableContextMenu, setPreviewTableContextMenu] =
        useState<PreviewTableContextMenu | null>(null);

    const replaceMarkdownTable = useCallback(
        (
            source: MarkdownTableSource,
            replacement: string
        ) => {
            const editorView =
                editorRef.current?.getEditorView();

            if (editorView) {
                editorView.dispatch({
                    changes: {
                        from: source.from,
                        to: source.to,
                        insert: replacement
                    }
                });
            } else {
                handleChange(
                    contentRef.current.slice(0, source.from) +
                    replacement +
                    contentRef.current.slice(source.to)
                );
            }
        },
        [handleChange]
    );

    const finishPreviewTableCellEdit = useCallback(
        (
            cell: HTMLTableCellElement,
            cancel = false
        ) => {
            const active =
                activePreviewTableCellRef.current;

            if (!active || active.element !== cell) {
                return;
            }

            activePreviewTableCellRef.current = null;
            cell.removeAttribute('contenteditable');
            cell.classList.remove(
                'editable-preview-table__cell--editing'
            );

            const nextValue = cancel
                ? active.originalValue
                : (cell.innerText || '')
                    .replace(/\r?\n/g, ' ')
                    .trim();

            if (
                cancel ||
                nextValue === active.originalValue
            ) {
                cell.innerHTML = active.originalHtml;
                return;
            }

            const replacement = updateMarkdownTableCell(
                active.source,
                active.row,
                active.column,
                nextValue
            );
            replaceMarkdownTable(
                active.source,
                replacement
            );
        },
        [replaceMarkdownTable]
    );

    const handlePreviewTableContextMenu = useCallback(
        (event: ReactMouseEvent<HTMLDivElement>) => {
            if (isReadOnly) {
                return;
            }

            const target = event.target;

            if (!(target instanceof Element)) {
                return;
            }

            const cell = target.closest('th, td');
            const table = cell?.closest(
                'table.editable-preview-table'
            );
            const row = cell?.parentElement;

            if (
                !(cell instanceof HTMLTableCellElement) ||
                !(table instanceof HTMLTableElement) ||
                !(row instanceof HTMLTableRowElement)
            ) {
                return;
            }

            event.preventDefault();

            const active =
                activePreviewTableCellRef.current;

            if (active) {
                finishPreviewTableCellEdit(
                    active.element
                );
            }

            const menuWidth = 224;
            const menuHeight = 438;

            setPreviewTableContextMenu({
                left: Math.max(
                    8,
                    Math.min(
                        event.clientX,
                        window.innerWidth - menuWidth - 8
                    )
                ),
                top: Math.max(
                    8,
                    Math.min(
                        event.clientY,
                        window.innerHeight - menuHeight - 8
                    )
                ),
                startLine: Number(table.dataset.line),
                endLine: Number(table.dataset.mdTableEnd),
                row: row.rowIndex,
                column: cell.cellIndex
            });
        },
        [finishPreviewTableCellEdit, isReadOnly]
    );

    const applyPreviewTableOperation = useCallback(
        (operation: PreviewTableOperation) => {
            const menu = previewTableContextMenu;

            if (!menu) {
                return;
            }

            const source = getMarkdownTableSource(
                contentRef.current,
                menu.startLine,
                menu.endLine
            );

            if (!source) {
                setPreviewTableContextMenu(null);
                return;
            }

            replaceMarkdownTable(
                source,
                operateMarkdownTable(
                    source,
                    menu.row,
                    menu.column,
                    operation
                )
            );
            setPreviewTableContextMenu(null);
        },
        [previewTableContextMenu, replaceMarkdownTable]
    );

    const applyPreviewTableAlignment = useCallback(
        (alignment: Exclude<MarkdownTableAlignment, null>) => {
            const menu = previewTableContextMenu;

            if (!menu) {
                return;
            }

            const source = getMarkdownTableSource(
                contentRef.current,
                menu.startLine,
                menu.endLine
            );

            if (!source) {
                setPreviewTableContextMenu(null);
                return;
            }

            const alignments = [...source.alignments];

            alignments[menu.column] = alignment;
            replaceMarkdownTable(
                source,
                serializeMarkdownTable(
                    source,
                    source.cells,
                    alignments
                )
            );
            setPreviewTableContextMenu(null);
        },
        [previewTableContextMenu, replaceMarkdownTable]
    );

    useEffect(() => {
        if (!previewTableContextMenu) {
            return;
        }

        const closeMenu = (event: Event) => {
            if (
                event.target instanceof Element &&
                event.target.closest(
                    '.preview-table-context-menu'
                )
            ) {
                return;
            }

            setPreviewTableContextMenu(null);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setPreviewTableContextMenu(null);
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
    }, [previewTableContextMenu]);

    const handlePreviewTableClick = useCallback(
        (event: ReactMouseEvent<HTMLDivElement>) => {
            if (isReadOnly) {
                return;
            }

            const target = event.target;

            if (!(target instanceof Element)) {
                return;
            }

            const cell = target.closest('th, td');
            const table = cell?.closest(
                'table.editable-preview-table'
            );

            if (
                !(cell instanceof HTMLTableCellElement) ||
                !(table instanceof HTMLTableElement)
            ) {
                return;
            }

            if (
                activePreviewTableCellRef.current
                    ?.element === cell
            ) {
                return;
            }

            const startLine = Number(
                table.dataset.line
            );
            const endLine = Number(
                table.dataset.mdTableEnd
            );
            const source = getMarkdownTableSource(
                contentRef.current,
                startLine,
                endLine
            );
            const rowElement = cell.parentElement;

            if (
                !source ||
                !(rowElement instanceof HTMLTableRowElement)
            ) {
                return;
            }

            const row = rowElement.rowIndex;
            const column = cell.cellIndex;
            const originalValue =
                source.cells[row]?.[column] ?? '';
            const originalHtml = cell.innerHTML;

            event.preventDefault();

            activePreviewTableCellRef.current = {
                element: cell,
                source,
                row,
                column,
                originalValue,
                originalHtml
            };

            cell.textContent = originalValue;
            cell.contentEditable = 'true';
            cell.classList.add(
                'editable-preview-table__cell--editing'
            );
            cell.focus();

            const selection = window.getSelection();

            if (selection) {
                const range = document.createRange();

                range.selectNodeContents(cell);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        },
        [isReadOnly]
    );

    const handlePreviewTableBlur = useCallback(
        (event: ReactFocusEvent<HTMLDivElement>) => {
            if (
                event.target instanceof
                HTMLTableCellElement
            ) {
                finishPreviewTableCellEdit(
                    event.target
                );
            }
        },
        [finishPreviewTableCellEdit]
    );

    const movePreviewTableCaret = useCallback(
        (
            currentCell: HTMLTableCellElement,
            targetRow: number,
            targetColumn: number,
            caretOffset: number | 'start' | 'end'
        ) => {
            const currentTable = currentCell.closest(
                'table.editable-preview-table'
            );
            const tableStartLine =
                currentTable?.getAttribute('data-line');

            if (!tableStartLine) {
                return;
            }

            finishPreviewTableCellEdit(currentCell);

            window.setTimeout(() => {
                const editorRoot = document.getElementById(
                    `markdown-editor-${openedDocument.documentId}`
                );
                const refreshedTable =
                    editorRoot?.querySelector<HTMLTableElement>(
                        `table.editable-preview-table[data-line="${tableStartLine}"]`
                    );
                const refreshedCell =
                    refreshedTable
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

                const textLength =
                    textNode.textContent?.length ?? 0;
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
        },
        [
            finishPreviewTableCellEdit,
            openedDocument.documentId
        ]
    );

    const handlePreviewTableKeyDown = useCallback(
        (event: ReactKeyboardEvent<HTMLDivElement>) => {
            if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === 's'
            ) {
                event.preventDefault();

                if (
                    event.target instanceof
                    HTMLTableCellElement
                ) {
                    finishPreviewTableCellEdit(
                        event.target
                    );
                }

                /*
                 * 表格修改通过 CodeMirror transaction 写回。
                 * 下一轮事件循环再保存，确保读取到最新 content。
                 */
                window.setTimeout(() => {
                    void saveCurrentContentRef.current(
                        contentRef.current,
                        'manual'
                    );
                }, 0);

                return;
            }

            if (
                !(event.target instanceof
                    HTMLTableCellElement) ||
                event.target.contentEditable !== 'true'
            ) {
                return;
            }

            if (
                event.altKey &&
                (
                    event.key === 'ArrowUp' ||
                    event.key === 'ArrowDown' ||
                    event.key === 'ArrowLeft' ||
                    event.key === 'ArrowRight'
                )
            ) {
                event.preventDefault();
                event.stopPropagation();

                const currentCell = event.target;
                const currentRow = currentCell.parentElement;
                const currentTable = currentCell.closest(
                    'table.editable-preview-table'
                );

                if (
                    !(currentRow instanceof
                        HTMLTableRowElement) ||
                    !(currentTable instanceof
                        HTMLTableElement)
                ) {
                    return;
                }

                const row = currentRow.rowIndex;
                const column = currentCell.cellIndex;
                const operation: PreviewTableOperation =
                    event.key === 'ArrowUp'
                        ? 'move-row-up'
                        : event.key === 'ArrowDown'
                            ? 'move-row-down'
                            : event.key === 'ArrowLeft'
                                ? 'move-column-left'
                                : 'move-column-right';
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
                    targetColumn >=
                        currentTable.rows[row].cells.length
                ) {
                    return;
                }

                const startLine = Number(
                    currentTable.dataset.line
                );
                const endLine = Number(
                    currentTable.dataset.mdTableEnd
                );

                finishPreviewTableCellEdit(currentCell);

                const source = getMarkdownTableSource(
                    contentRef.current,
                    startLine,
                    endLine
                );

                if (!source) {
                    return;
                }

                replaceMarkdownTable(
                    source,
                    operateMarkdownTable(
                        source,
                        row,
                        column,
                        operation
                    )
                );
                movePreviewTableCaret(
                    currentCell,
                    targetRow,
                    targetColumn,
                    'end'
                );

                return;
            }

            if (
                event.key === 'ArrowUp' ||
                event.key === 'ArrowDown' ||
                event.key === 'ArrowLeft' ||
                event.key === 'ArrowRight'
            ) {
                const currentCell = event.target;
                const currentRow = currentCell.parentElement;
                const currentTable = currentCell.closest(
                    'table.editable-preview-table'
                );

                if (
                    !(currentRow instanceof
                        HTMLTableRowElement) ||
                    !(currentTable instanceof
                        HTMLTableElement)
                ) {
                    return;
                }

                const selection = window.getSelection();

                if (!selection?.isCollapsed) {
                    return;
                }

                const caretRange = selection.getRangeAt(0)
                    .cloneRange();

                caretRange.selectNodeContents(currentCell);
                caretRange.setEnd(
                    selection.anchorNode ?? currentCell,
                    selection.anchorOffset
                );

                const caretOffset =
                    caretRange.toString().length;
                const textLength =
                    currentCell.innerText.length;
                const rows = currentTable.rows;
                let targetRow = currentRow.rowIndex;
                let targetColumn = currentCell.cellIndex;
                let targetCaret: number | 'start' | 'end' =
                    caretOffset;

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
                    const currentIndex = cells.indexOf(
                        currentCell
                    );

                    if (
                        event.key === 'ArrowLeft' &&
                        caretOffset === 0
                    ) {
                        const previousCell =
                            cells[currentIndex - 1];

                        if (!previousCell) {
                            return;
                        }

                        targetRow = (
                            previousCell.parentElement as
                            HTMLTableRowElement
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
                            nextCell.parentElement as
                            HTMLTableRowElement
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
                movePreviewTableCaret(
                    currentCell,
                    targetRow,
                    targetColumn,
                    targetCaret
                );

                return;
            }

            if (event.key === 'Tab') {
                event.preventDefault();

                const currentCell = event.target;
                const currentRow = currentCell.parentElement;
                const currentTable = currentCell.closest(
                    'table.editable-preview-table'
                );

                if (
                    !(currentRow instanceof
                        HTMLTableRowElement) ||
                    !(currentTable instanceof
                        HTMLTableElement)
                ) {
                    return;
                }

                const cells = Array.from(
                    currentTable.querySelectorAll<
                        HTMLTableCellElement
                    >('th, td')
                );
                const currentIndex = cells.indexOf(
                    currentCell
                );
                const nextIndex = event.shiftKey
                    ? currentIndex - 1
                    : currentIndex + 1;
                const nextCell = cells[nextIndex];
                const tableStartLine =
                    currentTable.dataset.line;
                const nextRowIndex =
                    nextCell?.parentElement instanceof
                    HTMLTableRowElement
                        ? nextCell.parentElement.rowIndex
                        : -1;
                const nextColumnIndex =
                    nextCell?.cellIndex ?? -1;

                finishPreviewTableCellEdit(
                    currentCell
                );

                if (
                    !tableStartLine ||
                    nextRowIndex < 0 ||
                    nextColumnIndex < 0
                ) {
                    return;
                }

                /*
                 * 预览会在 Markdown 写回后重新渲染，
                 * 因此要在新表格节点出现后再进入下一格。
                 */
                window.setTimeout(() => {
                    const editorRoot =
                        document.getElementById(
                            `markdown-editor-${openedDocument.documentId}`
                        );
                    const refreshedTable =
                        editorRoot?.querySelector<
                            HTMLTableElement
                        >(
                            `table.editable-preview-table[data-line="${tableStartLine}"]`
                        );
                    const refreshedCell =
                        refreshedTable
                            ?.rows[nextRowIndex]
                            ?.cells[nextColumnIndex];

                    refreshedCell?.click();
                }, 140);

                return;
            }

            if (event.key === 'Enter') {
                event.preventDefault();
                event.target.blur();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                finishPreviewTableCellEdit(
                    event.target,
                    true
                );
                event.target.blur();
            }
        },
        [
            finishPreviewTableCellEdit,
            movePreviewTableCaret,
            openedDocument.documentId,
            replaceMarkdownTable
        ]
    );

    useEffect(() => {
        return () => {
            if (autoSaveTimerRef.current !== null) {
                window.clearTimeout(
                    autoSaveTimerRef.current
                );
            }

            if (lengthTimerRef.current !== null) {
                window.clearTimeout(
                    lengthTimerRef.current
                );
            }
        };
    }, []);

    const [
        isUploadingImage,
        setIsUploadingImage
    ] = useState(false);

    const uploadImageFiles = useCallback(
        async (
            files: File[]
        ): Promise<InsertedImage[]> => {
            if (isReadOnly) {
                setSaveMessage(
                    '当前文件为只读文件，不能插入图片'
                );

                return [];
            }

            if (
                isUploadingImage ||
                files.length === 0
            ) {
                return [];
            }

            setIsUploadingImage(true);

            setSaveMessage(
                files.length > 1
                    ? `正在上传 ${files.length} 张图片……`
                    : '正在上传图片……'
            );

            const uploadedImages:
                InsertedImage[] = [];

            const failureMessages:
                string[] = [];

            /*
             * 顺序上传，避免多张 10 MB 图片同时进入后端内存。
             */
            for (const file of files) {
                try {
                    const asset =
                        await uploadAsset(file);

                    uploadedImages.push(
                        toInsertedImage(asset)
                    );
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : '未知错误';

                    failureMessages.push(
                        `${file.name}：${message}`
                    );
                }
            }

            setIsUploadingImage(false);

            if (
                uploadedImages.length > 0 &&
                failureMessages.length === 0
            ) {
                setSaveMessage(
                    uploadedImages.length > 1
                        ? `已上传 ${uploadedImages.length} 张图片`
                        : '图片上传成功'
                );
            } else if (
                uploadedImages.length > 0 &&
                failureMessages.length > 0
            ) {
                setSaveMessage(
                    `已上传 ${uploadedImages.length} 张，` +
                    `${failureMessages.length} 张失败：` +
                    failureMessages.join('；')
                );
            } else {
                setSaveMessage(
                    `图片上传失败：${
                        failureMessages.join('；') ||
                        '没有可上传的图片'
                    }`
                );
            }

            return uploadedImages;
        },
        [
            isReadOnly,
            isUploadingImage
        ]
    );

    const handleUploadImages:
        UploadImgEvent = useCallback(
        (
            files,
            callback
        ) => {
            void (
                async () => {
                    const uploadedImages =
                        await uploadImageFiles(
                            files
                        );

                    if (
                        uploadedImages.length === 0
                    ) {
                        return;
                    }

                    const callbackValue:
                        UploadImgCallBackParam =
                        uploadedImages;

                    /*
                     * md-editor-rt 自动把这些地址
                     * 插入当前光标位置。
                     */
                    callback(callbackValue);
                }
            )();
        },
        [uploadImageFiles]
    );

    const handleDrop = useCallback(
        (event: DragEvent) => {
            const files = Array.from(
                event.dataTransfer?.files ?? []
            ).filter((file) => {
                return file.type.startsWith(
                    'image/'
                );
            });

            if (files.length === 0) {
                return;
            }

            event.preventDefault();

            void (
                async () => {
                    const uploadedImages =
                        await uploadImageFiles(
                            files
                        );

                    if (
                        uploadedImages.length === 0
                    ) {
                        return;
                    }

                    const markdown =
                        createImageMarkdown(
                            uploadedImages
                        );

                    editorRef.current?.insert(
                        () => ({
                            targetValue:
                                `\n${markdown}\n`,
                            select: false
                        })
                    );
                }
            )();
        },
        [uploadImageFiles]
    );

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
    const contextMenuTable = previewTableContextMenu
        ? getMarkdownTableSource(
            contentRef.current,
            previewTableContextMenu.startLine,
            previewTableContextMenu.endLine
        )
        : null;
    const contextMenuAlignment =
        previewTableContextMenu && contextMenuTable
            ? contextMenuTable.alignments[
                previewTableContextMenu.column
            ]
            : null;

    return (
        <section
            className={
                `document-editor document-editor--${theme}` +
                (isReadOnly
                    ? ' document-editor--readonly'
                    : '')
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

            {saveMessage && (
                <div className="document-editor__message">
                    {saveMessage}
                </div>
            )}

            <div
                className="document-editor__main"
                onClick={handlePreviewTableClick}
                onBlurCapture={handlePreviewTableBlur}
                onKeyDownCapture={
                    handlePreviewTableKeyDown
                }
                onContextMenu={
                    handlePreviewTableContextMenu
                }
            >
                <MdEditor
                    ref={editorRef}
                    id={
                        `markdown-editor-${openedDocument.documentId}`
                    }
                    preview={!isMobileLayout}
                    inputBoxWidth={
                        isMobileLayout
                            ? '100%'
                            : '50%'
                    }
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
                    toolbars={editorToolbars}
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

            {previewTableContextMenu && contextMenuTable && (
                <div
                    className={
                        'preview-table-context-menu'
                    }
                    style={{
                        left: previewTableContextMenu.left,
                        top: previewTableContextMenu.top
                    }}
                    role="menu"
                    aria-label="表格操作"
                >
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            applyPreviewTableOperation(
                                'insert-row-above'
                            );
                        }}
                    >
                        上方插入行
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            applyPreviewTableOperation(
                                'insert-row-below'
                            );
                        }}
                    >
                        下方插入行
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            applyPreviewTableOperation(
                                'insert-column-left'
                            );
                        }}
                    >
                        左边插入列
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                            applyPreviewTableOperation(
                                'insert-column-right'
                            );
                        }}
                    >
                        右边插入列
                    </button>

                    <div className="preview-table-context-menu__separator" />

                    <button
                        type="button"
                        role="menuitem"
                        disabled={previewTableContextMenu.row === 0}
                        onClick={() => {
                            applyPreviewTableOperation(
                                'move-row-up'
                            );
                        }}
                    >
                        <span>上移本行</span>
                        <kbd>Alt+↑</kbd>
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        disabled={
                            previewTableContextMenu.row >=
                            contextMenuTable.cells.length - 1
                        }
                        onClick={() => {
                            applyPreviewTableOperation(
                                'move-row-down'
                            );
                        }}
                    >
                        <span>下移本行</span>
                        <kbd>Alt+↓</kbd>
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        disabled={previewTableContextMenu.column === 0}
                        onClick={() => {
                            applyPreviewTableOperation(
                                'move-column-left'
                            );
                        }}
                    >
                        <span>左移本列</span>
                        <kbd>Alt+←</kbd>
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        disabled={
                            previewTableContextMenu.column >=
                            contextMenuTable.alignments.length - 1
                        }
                        onClick={() => {
                            applyPreviewTableOperation(
                                'move-column-right'
                            );
                        }}
                    >
                        <span>右移本列</span>
                        <kbd>Alt+→</kbd>
                    </button>

                    <div className="preview-table-context-menu__separator" />

                    <button
                        type="button"
                        role="menuitem"
                        className="preview-table-context-menu__danger"
                        onClick={() => {
                            applyPreviewTableOperation(
                                'delete-row'
                            );
                        }}
                    >
                        删除本行
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className="preview-table-context-menu__danger"
                        disabled={
                            contextMenuTable.alignments.length <= 1
                        }
                        onClick={() => {
                            applyPreviewTableOperation(
                                'delete-column'
                            );
                        }}
                    >
                        删除本列
                    </button>

                    <div className="preview-table-context-menu__separator" />

                    <div
                        className={
                            'preview-table-context-menu__alignments'
                        }
                        aria-label="本列对齐方式"
                    >
                        <button
                            type="button"
                            title="左对齐本列"
                            aria-label="左对齐本列"
                            aria-pressed={
                                contextMenuAlignment === 'left'
                            }
                            onClick={() => {
                                applyPreviewTableAlignment('left');
                            }}
                        >
                            <TableAlignmentIcon
                                alignment="left"
                            />
                        </button>
                        <button
                            type="button"
                            title="居中对齐本列"
                            aria-label="居中对齐本列"
                            aria-pressed={
                                contextMenuAlignment === 'center'
                            }
                            onClick={() => {
                                applyPreviewTableAlignment('center');
                            }}
                        >
                            <TableAlignmentIcon
                                alignment="center"
                            />
                        </button>
                        <button
                            type="button"
                            title="右对齐本列"
                            aria-label="右对齐本列"
                            aria-pressed={
                                contextMenuAlignment === 'right'
                            }
                            onClick={() => {
                                applyPreviewTableAlignment('right');
                            }}
                        >
                            <TableAlignmentIcon
                                alignment="right"
                            />
                        </button>
                    </div>
                </div>
            )}

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
        </section>
    );
}
