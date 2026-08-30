import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {
    Bold,
    Code,
    Highlighter,
    Italic,
    Link,
    Redo2,
    Save,
    Sigma,
    Smile,
    Strikethrough,
    Subscript,
    Superscript,
    Underline,
    Undo2
} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';

import {emojiOptions} from '../emoji-options';
import type {MarkdownFormatCommand} from './markdown-format';
import type {PreviewTableToolbarState} from './use-preview-table';

type TableToolbarProps = {
    toolbar: PreviewTableToolbarState;
    canFormat: boolean;
    onFormat: (command: MarkdownFormatCommand) => void;
    onInsertText: (text: string) => void;
    onUndo: () => void;
    onRedo: () => void;
    onSave: () => void;
    onPointerEnter: () => void;
    onPointerLeave: () => void;
};

const formatButtons: Array<{
    command: MarkdownFormatCommand;
    icon: LucideIcon;
    title: string;
}> = [
    {command: 'bold', icon: Bold, title: '加粗（Ctrl+B）'},
    {command: 'underline', icon: Underline, title: '下划线（Ctrl+U）'},
    {command: 'italic', icon: Italic, title: '斜体（Ctrl+I）'},
    {command: 'strikethrough', icon: Strikethrough, title: '删除线（Ctrl+Shift+X）'},
    {command: 'subscript', icon: Subscript, title: '下标'},
    {command: 'superscript', icon: Superscript, title: '上标'},
    {command: 'mark', icon: Highlighter, title: '标注'},
    {command: 'inline-code', icon: Code, title: '行内代码'},
    {command: 'link', icon: Link, title: '链接（Ctrl+K）'},
    {command: 'inline-formula', icon: Sigma, title: '行内公式'}
];

function preserveEditorSelection(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as Element).closest('button')) {
        event.preventDefault();
    }
}

function FormatButton({command, disabled, onFormat}: {
    command: MarkdownFormatCommand;
    disabled: boolean;
    onFormat: (command: MarkdownFormatCommand) => void;
}) {
    const button = formatButtons.find((item) => item.command === command)!;
    const Icon = button.icon;

    return (
        <button
            type="button"
            title={button.title}
            aria-label={button.title}
            disabled={disabled}
            onClick={() => onFormat(command)}
        >
            <Icon aria-hidden="true" />
        </button>
    );
}

export function TableToolbar({
    toolbar,
    canFormat,
    onFormat,
    onInsertText,
    onUndo,
    onRedo,
    onSave,
    onPointerEnter,
    onPointerLeave
}: TableToolbarProps) {
    const [emojiOpen, setEmojiOpen] = useState(false);
    const emojiButtonRef = useRef<HTMLButtonElement | null>(null);
    const emojiMenuRef = useRef<HTMLDivElement | null>(null);
    const [emojiMenuPosition, setEmojiMenuPosition] = useState({
        top: 0,
        left: 0
    });
    const previewScroller = toolbar.table.closest<HTMLElement>(
        '.md-editor-preview-wrapper'
    );

    useLayoutEffect(() => {
        if (!emojiOpen || !emojiButtonRef.current) {
            return;
        }

        const buttonRect = emojiButtonRef.current.getBoundingClientRect();
        const menuWidth = 232;
        const viewportPadding = 8;

        setEmojiMenuPosition({
            top: buttonRect.bottom + 6,
            left: Math.min(
                Math.max(viewportPadding, buttonRect.left),
                window.innerWidth - menuWidth - viewportPadding
            )
        });
    }, [emojiOpen]);

    useEffect(() => {
        if (!emojiOpen) {
            return;
        }

        const closeEmojiMenu = (event: Event) => {
            const target = event.target;

            if (
                target instanceof Node &&
                (emojiButtonRef.current?.contains(target) ||
                    emojiMenuRef.current?.contains(target))
            ) {
                return;
            }
            setEmojiOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setEmojiOpen(false);
                emojiButtonRef.current?.focus({preventScroll: true});
            }
        };

        window.addEventListener('pointerdown', closeEmojiMenu);
        window.addEventListener('resize', closeEmojiMenu);
        window.addEventListener('scroll', closeEmojiMenu, true);
        window.addEventListener('keydown', closeOnEscape);

        return () => {
            window.removeEventListener('pointerdown', closeEmojiMenu);
            window.removeEventListener('resize', closeEmojiMenu);
            window.removeEventListener('scroll', closeEmojiMenu, true);
            window.removeEventListener('keydown', closeOnEscape);
        };
    }, [emojiOpen]);

    if (!previewScroller) {
        return null;
    }

    return createPortal(
        <div
            className="preview-table-toolbar"
            style={{top: toolbar.top, left: toolbar.left}}
            role="toolbar"
            aria-label="当前表格单元格工具栏"
            onPointerDown={preserveEditorSelection}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
        >
            <FormatButton command="bold" disabled={!canFormat} onFormat={onFormat} />
            <FormatButton command="underline" disabled={!canFormat} onFormat={onFormat} />
            <FormatButton command="italic" disabled={!canFormat} onFormat={onFormat} />
            <FormatButton command="strikethrough" disabled={!canFormat} onFormat={onFormat} />
            <span className="preview-table-toolbar__separator" />
            <FormatButton command="subscript" disabled={!canFormat} onFormat={onFormat} />
            <FormatButton command="superscript" disabled={!canFormat} onFormat={onFormat} />
            <FormatButton command="mark" disabled={!canFormat} onFormat={onFormat} />
            <div className="preview-table-toolbar__emoji">
                <button
                    ref={emojiButtonRef}
                    type="button"
                    title="Emoji"
                    aria-label="Emoji"
                    aria-expanded={emojiOpen}
                    disabled={!canFormat}
                    onClick={() => setEmojiOpen((open) => !open)}
                >
                    <Smile aria-hidden="true" />
                </button>
                {emojiOpen && canFormat && createPortal(
                    <div
                        ref={emojiMenuRef}
                        className="preview-table-toolbar preview-table-toolbar__emoji-menu"
                        style={emojiMenuPosition}
                        role="menu"
                        aria-label="选择 Emoji"
                        onPointerDown={preserveEditorSelection}
                        onPointerEnter={onPointerEnter}
                        onPointerLeave={onPointerLeave}
                    >
                        {emojiOptions.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                aria-label={`插入 ${emoji}`}
                                onClick={() => {
                                    onInsertText(emoji);
                                    setEmojiOpen(false);
                                }}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>,
                    document.body
                )}
            </div>
            <span className="preview-table-toolbar__separator" />
            <FormatButton command="inline-code" disabled={!canFormat} onFormat={onFormat} />
            <FormatButton command="link" disabled={!canFormat} onFormat={onFormat} />
            <FormatButton command="inline-formula" disabled={!canFormat} onFormat={onFormat} />
            <span className="preview-table-toolbar__separator" />
            <button type="button" title="撤销（Ctrl+Z）" aria-label="撤销" onClick={onUndo}><Undo2 aria-hidden="true" /></button>
            <button type="button" title="重做（Ctrl+Y）" aria-label="重做" onClick={onRedo}><Redo2 aria-hidden="true" /></button>
            <button type="button" title="保存（Ctrl+S）" aria-label="保存" onClick={onSave}><Save aria-hidden="true" /></button>
        </div>,
        previewScroller
    );
}
