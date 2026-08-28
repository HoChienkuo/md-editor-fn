import type {
    MarkdownTableAlignment,
    MarkdownTableSource,
    PreviewTableOperation
} from './types';

export function splitMarkdownTableRow(
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

            while (value[index + fenceLength] === '`') {
                fenceLength += 1;
            }

            if (backtickFence === 0) {
                backtickFence = fenceLength;
            } else if (backtickFence === fenceLength) {
                backtickFence = 0;
            }

            cell += value.slice(index, index + fenceLength);
            index += fenceLength;
            continue;
        }

        let previousBackslashes = 0;

        for (
            let cursor = index - 1;
            cursor >= 0 && value[cursor] === '\\';
            cursor -= 1
        ) {
            previousBackslashes += 1;
        }

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

export function getMarkdownTableSource(
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
        ? sourceText.slice(0, -trailingLineEnding.length)
        : sourceText;
    const lines = tableText.split(/\r?\n/);

    if (lines.length < 2) {
        return null;
    }

    const delimiterCells = splitMarkdownTableRow(lines[1]);
    const parsedCells = [
        splitMarkdownTableRow(lines[0]),
        ...lines.slice(2).map(splitMarkdownTableRow)
    ];
    const columnCount = Math.max(
        delimiterCells.length,
        ...parsedCells.map((cells) => cells.length)
    );
    const cells = parsedCells.map((row) => Array.from(
        {length: columnCount},
        (_, column) => row[column] ?? ''
    ));
    const alignments = Array.from(
        {length: columnCount},
        (_, column): MarkdownTableAlignment => {
            const delimiter = delimiterCells[column]?.trim() ?? '';
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
        lineEnding: tableText.includes('\r\n') ? '\r\n' : '\n',
        trailingLineEnding,
        lines,
        cells,
        alignments
    };
}

function escapeMarkdownTableCell(value: string): string {
    return value
        .replace(/\r?\n/g, '<br>')
        .replace(/(^|[^\\])\|/g, '$1\\|')
        .trim();
}

export function serializeMarkdownTable(
    source: MarkdownTableSource,
    cells: string[][],
    alignments = source.alignments
): string {
    const serializeRow = (row: string[]) => {
        return `| ${row.map(escapeMarkdownTableCell).join(' | ')} |`;
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
    ].join(source.lineEnding) + source.trailingLineEnding;
}

export function updateMarkdownTableCell(
    source: MarkdownTableSource,
    row: number,
    column: number,
    value: string
): string {
    const nextCells = source.cells.map((cells) => [...cells]);
    const targetRow = nextCells[row];

    if (!targetRow) {
        return source.lines.join(source.lineEnding);
    }

    targetRow[column] = value;

    return serializeMarkdownTable(source, nextCells);
}

export function operateMarkdownTable(
    source: MarkdownTableSource,
    rowIndex: number,
    columnIndex: number,
    operation: PreviewTableOperation
): string {
    const cells = source.cells.map((row) => [...row]);
    const alignments = [...source.alignments];
    const columnCount = alignments.length;
    const emptyRow = () => Array.from(
        {length: columnCount},
        () => ''
    );

    switch (operation) {
        case 'insert-row-above':
            cells.splice(rowIndex, 0, emptyRow());
            break;
        case 'insert-row-below':
            cells.splice(rowIndex + 1, 0, emptyRow());
            break;
        case 'insert-column-left':
        case 'insert-column-right': {
            const offset = operation === 'insert-column-right' ? 1 : 0;
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

    return serializeMarkdownTable(source, cells, alignments);
}
