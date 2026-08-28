import {useLayoutEffect, useRef} from 'react';
import type {ClipboardEvent, KeyboardEvent} from 'react';

import type {PreviewTableCellEditorState} from './use-preview-table';

type TableCellEditorProps = {
    editor: PreviewTableCellEditorState;
    onChange: (value: string) => void;
    onCommit: () => void;
    onCancel: () => void;
    onTab: (backwards: boolean) => void;
    onContextMenu: (clientX: number, clientY: number) => void;
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
    onContextMenu
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

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.nativeEvent.isComposing) {
            return;
        }

        if (event.key === 'Enter') {
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
        onChange(
            editor.value.slice(0, start) +
            markdownLink +
            editor.value.slice(end)
        );

        window.requestAnimationFrame(() => {
            const nextPosition = start + markdownLink.length;
            textareaRef.current?.setSelectionRange(
                nextPosition,
                nextPosition
            );
        });
    };

    return (
        <textarea
            ref={textareaRef}
            className="preview-table-cell-editor"
            style={{
                top: editor.top,
                left: editor.left,
                width: editor.width,
                height: editor.height
            }}
            value={editor.value}
            aria-label={`编辑表格第 ${editor.row + 1} 行第 ${editor.column + 1} 列`}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={onCommit}
            onContextMenu={(event) => {
                event.preventDefault();
                onContextMenu(event.clientX, event.clientY);
            }}
        />
    );
}
