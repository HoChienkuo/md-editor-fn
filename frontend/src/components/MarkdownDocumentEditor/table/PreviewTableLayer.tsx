import {TableCellEditor} from './TableCellEditor';
import type {PreviewTableCellEditorState} from './use-preview-table';

type PreviewTableLayerProps = {
    editor: PreviewTableCellEditorState | null;
    onChange: (value: string) => void;
    onCommit: () => void;
    onCancel: () => void;
    onTab: (backwards: boolean) => void;
    onContextMenu: (clientX: number, clientY: number) => void;
};

export function PreviewTableLayer({
    editor,
    onChange,
    onCommit,
    onCancel,
    onTab,
    onContextMenu
}: PreviewTableLayerProps) {
    return editor ? (
        <TableCellEditor
            editor={editor}
            onChange={onChange}
            onCommit={onCommit}
            onCancel={onCancel}
            onTab={onTab}
            onContextMenu={onContextMenu}
        />
    ) : null;
}
