import {
    allToolbar
} from 'md-editor-rt';

const taskToolbarIndex = allToolbar.indexOf('task');
const saveToolbarIndex = allToolbar.indexOf('save');
const rightToolbarIndex = allToolbar.indexOf('=');

export const editorToolbars = [
    ...allToolbar.slice(0, taskToolbarIndex + 1),
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
    ...allToolbar.slice(rightToolbarIndex + 1)
];

export function getVisibleEditorToolbars(
    isMobileLayout: boolean
) {
    return isMobileLayout
        ? editorToolbars.filter(
            (toolbar) => toolbar !== 'preview'
        )
        : editorToolbars;
}
