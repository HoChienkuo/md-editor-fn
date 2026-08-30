import {useLayoutEffect, useRef} from 'react';
import type {ClipboardEvent, KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';

import type {PreviewTableCellEditorState} from './use-preview-table';
import type {
    MarkdownFormatCommand
} from './markdown-format';
import type {PreviewTableOperation} from './types';

type TableCellEditorProps = {
    editor: PreviewTableCellEditorState;
    onChange: (value: string, selectionStart?: number, selectionEnd?: number) => void;
    onCommit: () => void;
    onCancel: () => void;
    onTab: (backwards: boolean) => void;
    onContextMenu: (clientX: number, clientY: number) => void;
    onSelectionChange: (start: number, end: number) => void;
    onFormat: (command: MarkdownFormatCommand) => void;
    onMove: (operation: PreviewTableOperation) => void;
    onUndo: () => void;
    onRedo: () => void;
};

function escapeLinkLabel(value: string): string {
    return value.replace(/[\\[\]]/g, '\\$&');
}

function escapeLinkDestination(value: string): string {
    return value.replace(/\r?\n/g, '').replace(/[\\()]/g, '\\$&');
}

function convertHtmlLinksToMarkdown(html: string): string | null {
    if (!html) {
        return null;
    }

    const fragment = new DOMParser().parseFromString(html, 'text/html');

    if (!fragment.querySelector('a[href]')) {
        return null;
    }

    const convertNode = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent ?? '';
        }
        if (!(node instanceof HTMLElement)) {
            return '';
        }
        if (node.tagName === 'BR') {
            return '\n';
        }
        if (node.tagName === 'A') {
            const href = node.getAttribute('href')?.trim();
            const label = node.textContent?.trim() || href;

            return href && label
                ? `[${escapeLinkLabel(label)}](${escapeLinkDestination(href)})`
                : node.textContent ?? '';
        }

        const content = Array.from(node.childNodes)
            .map(convertNode)
            .join('');

        return ['DIV', 'P', 'LI'].includes(node.tagName)
            ? `${content}\n`
            : content;
    };

    return Array.from(fragment.body.childNodes)
        .map(convertNode)
        .join('')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function TableCellEditor({
    editor,
    onChange,
    onCommit,
    onCancel,
    onTab,
    onContextMenu,
    onSelectionChange,
    onFormat,
    onMove,
    onUndo,
    onRedo
}: TableCellEditorProps) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useLayoutEffect(() => {
        const textarea = textareaRef.current;

        if (!textarea) {
            return;
        }

        textarea.focus({preventScroll: true});
        textarea.setSelectionRange(
            textarea.value.length,
            textarea.value.length
        );
    }, [editor.element]);

    useLayoutEffect(() => {
        textareaRef.current?.setSelectionRange(
            editor.selectionStart,
            editor.selectionEnd
        );
    }, [editor.selectionRevision]);

    const getFormatCommand = (
        event: KeyboardEvent<HTMLTextAreaElement>
    ): MarkdownFormatCommand | null => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey) {
            return null;
        }

        const key = event.key.toLowerCase();

        if (key === 'b' && !event.shiftKey) {
            return 'bold';
        }
        if (key === 'i' && !event.shiftKey) {
            return 'italic';
        }
        if (key === 'u' && !event.shiftKey) {
            return 'underline';
        }
        if (key === 'k' && !event.shiftKey) {
            return 'link';
        }
        if (key === 'x' && event.shiftKey) {
            return 'strikethrough';
        }
        if (event.code === 'Backquote') {
            return 'inline-code';
        }

        return null;
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.nativeEvent.isComposing) {
            return;
        }

        const command = getFormatCommand(event);
        const historyDirection = (event.ctrlKey || event.metaKey) &&
            !event.altKey
            ? event.key.toLowerCase() === 'y' ||
                (event.key.toLowerCase() === 'z' && event.shiftKey)
                ? 'redo'
                : event.key.toLowerCase() === 'z'
                    ? 'undo'
                    : null
            : null;
        const moveOperation: PreviewTableOperation | null =
            event.altKey && event.key === 'ArrowUp'
                ? 'move-row-up'
                : event.altKey && event.key === 'ArrowDown'
                    ? 'move-row-down'
                    : event.altKey && event.key === 'ArrowLeft'
                        ? 'move-column-left'
                        : event.altKey && event.key === 'ArrowRight'
                            ? 'move-column-right'
                            : null;

        if (historyDirection) {
            event.preventDefault();
            event.stopPropagation();
            (historyDirection === 'undo' ? onUndo : onRedo)();
        } else if (moveOperation) {
            event.preventDefault();
            event.stopPropagation();
            onMove(moveOperation);
        } else if (command) {
            event.preventDefault();
            event.stopPropagation();
            onFormat(command);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            onCommit();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
        } else if (event.key === 'Tab') {
            event.preventDefault();
            onTab(event.shiftKey);
        }
    };

    const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
        const markdownLink = convertHtmlLinksToMarkdown(
            event.clipboardData.getData('text/html')
        );

        if (markdownLink === null) {
            return;
        }

        event.preventDefault();
        const textarea = event.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const nextPosition = start + markdownLink.length;
        onChange(
            editor.value.slice(0, start) +
            markdownLink +
            editor.value.slice(end)
        );

        window.requestAnimationFrame(() => {
            textareaRef.current?.setSelectionRange(
                nextPosition,
                nextPosition
            );
            onSelectionChange(nextPosition, nextPosition);
        });
    };

    return createPortal(
        <textarea
            ref={textareaRef}
            className="preview-table-cell-editor"
            value={editor.value}
            aria-label={`编辑表格第 ${editor.row + 1} 行第 ${editor.column + 1} 列`}
            onChange={(event) => onChange(
                event.target.value,
                event.target.selectionStart,
                event.target.selectionEnd
            )}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onSelect={(event) => {
                onSelectionChange(
                    event.currentTarget.selectionStart,
                    event.currentTarget.selectionEnd
                );
            }}
            onBlur={onCommit}
            onContextMenu={(event) => {
                event.preventDefault();
                onContextMenu(event.clientX, event.clientY);
            }}
        />,
        editor.element
    );
}
