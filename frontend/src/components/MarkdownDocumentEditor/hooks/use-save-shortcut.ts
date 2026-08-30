import {
    useEffect
} from 'react';
import type {
    RefObject
} from 'react';

import type {
    SaveMode
} from './use-document-save';

type ActiveCellRef = RefObject<{
    element: HTMLTableCellElement;
} | null>;

type SaveFunctionRef = RefObject<(
    content: string,
    mode: SaveMode
) => Promise<void>>;

type UseSaveShortcutOptions = {
    activeCellRef: ActiveCellRef;
    contentRef: RefObject<string>;
    saveCurrentContentRef: SaveFunctionRef;
    finishActiveCellEdit: (
        cell: HTMLTableCellElement
    ) => void;
};

export function useSaveShortcut({
    activeCellRef,
    contentRef,
    saveCurrentContentRef,
    finishActiveCellEdit
}: UseSaveShortcutOptions): void {
    useEffect(() => {
        const handleSaveShortcut = (event: KeyboardEvent) => {
            if (
                !(event.ctrlKey || event.metaKey) ||
                event.key.toLowerCase() !== 's'
            ) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            if (event.repeat) {
                return;
            }

            const activeCell = activeCellRef.current?.element;

            if (activeCell) {
                finishActiveCellEdit(activeCell);

                /*
                 * 表格通过 CodeMirror transaction 写回，下一轮
                 * 事件循环再读取并保存最新内容。
                 */
                window.setTimeout(() => {
                    void saveCurrentContentRef.current(
                        contentRef.current,
                        'manual'
                    );
                }, 0);
                return;
            }

            void saveCurrentContentRef.current(
                contentRef.current,
                'manual'
            );
        };

        window.addEventListener('keydown', handleSaveShortcut, true);

        return () => {
            window.removeEventListener(
                'keydown',
                handleSaveShortcut,
                true
            );
        };
    }, [
        activeCellRef,
        contentRef,
        finishActiveCellEdit,
        saveCurrentContentRef
    ]);
}
