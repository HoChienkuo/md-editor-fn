export type MarkdownTableAlignment =
    'left' | 'center' | 'right' | null;

export type MarkdownTableSource = {
    from: number;
    to: number;
    lineEnding: string;
    trailingLineEnding: string;
    lines: string[];
    cells: string[][];
    alignments: MarkdownTableAlignment[];
};

export type PreviewTableOperation =
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
