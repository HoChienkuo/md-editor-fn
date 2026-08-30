import {TableCellEditor} from './TableCellEditor';
import type {PreviewTableCellEditorState} from './use-preview-table';
import type {PreviewTableToolbarState} from './use-preview-table';
import {TableToolbar} from './TableToolbar';
import type {MarkdownFormatCommand} from './markdown-format';
import type {PreviewTableOperation} from './types';

type PreviewTableLayerProps = {
    editor: PreviewTableCellEditorState | null;
    onChange: (value: string, selectionStart?: number, selectionEnd?: number) => void;
    onCommit: () => void;
    onCancel: () => void;
    onTab: (backwards: boolean) => void;
    onContextMenu: (clientX: number, clientY: number) => void;
    onSelectionChange: (start: number, end: number) => void;
    onFormat: (command: MarkdownFormatCommand) => void;
    onInsertText: (text: string) => void;
    onMove: (operation: PreviewTableOperation) => void;
    onUndo: () => void;
    onRedo: () => void;
    onCellUndo: () => void;
    onCellRedo: () => void;
    onSave: () => void;
    toolbar: PreviewTableToolbarState | null;
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
    onInsertText,
    onMove,
    onUndo,
    onRedo,
    onCellUndo,
    onCellRedo,
    onSave,
    toolbar,
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
                    onUndo={onCellUndo}
                    onRedo={onCellRedo}
                />
            )}

            {toolbar && (
                <TableToolbar
                    toolbar={toolbar}
                    canFormat={editor !== null}
                    onFormat={onFormat}
                    onInsertText={onInsertText}
                    onUndo={onUndo}
                    onRedo={onRedo}
                    onSave={onSave}
                    onPointerEnter={onToolbarPointerEnter}
                    onPointerLeave={onToolbarPointerLeave}
                />
            )}
        </>
    );
}
