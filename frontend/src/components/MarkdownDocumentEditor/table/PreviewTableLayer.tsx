import {TableCellEditor} from './TableCellEditor';
import type {PreviewTableCellEditorState} from './use-preview-table';
import type {PreviewTableToolbarState} from './use-preview-table';
import {TableToolbar} from './TableToolbar';
import type {MarkdownFormatCommand} from './markdown-format';
import type {
    MarkdownTableAlignment,
    PreviewTableOperation
} from './types';

type PreviewTableLayerProps = {
    editor: PreviewTableCellEditorState | null;
    onChange: (value: string) => void;
    onCommit: () => void;
    onCancel: () => void;
    onTab: (backwards: boolean) => void;
    onContextMenu: (clientX: number, clientY: number) => void;
    onSelectionChange: (start: number, end: number) => void;
    onFormat: (command: MarkdownFormatCommand) => void;
    onMove: (operation: PreviewTableOperation) => void;
    toolbar: PreviewTableToolbarState | null;
    onToolbarOperation: (operation: PreviewTableOperation) => void;
    onToolbarAlignment: (
        alignment: Exclude<MarkdownTableAlignment, null>
    ) => void;
    onToolbarPointerEnter: () => void;
    onToolbarPointerLeave: () => void;
};

export function PreviewTableLayer({
    editor,
    onChange,
    onCommit,
    onCancel,
    onTab,
    onContextMenu,
    onSelectionChange,
    onFormat,
    onMove,
    toolbar,
    onToolbarOperation,
    onToolbarAlignment,
    onToolbarPointerEnter,
    onToolbarPointerLeave
}: PreviewTableLayerProps) {
    return (
        <>
            {editor && (
                <TableCellEditor
                    editor={editor}
                    onChange={onChange}
                    onCommit={onCommit}
                    onCancel={onCancel}
                    onTab={onTab}
                    onContextMenu={onContextMenu}
                    onSelectionChange={onSelectionChange}
                    onFormat={onFormat}
                    onMove={onMove}
                />
            )}

            {toolbar && (
                <TableToolbar
                    toolbar={toolbar}
                    canFormat={editor !== null}
                    onFormat={onFormat}
                    onOperation={onToolbarOperation}
                    onAlignment={onToolbarAlignment}
                    onPointerEnter={onToolbarPointerEnter}
                    onPointerLeave={onToolbarPointerLeave}
                />
            )}
        </>
    );
}
