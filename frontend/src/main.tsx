import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {
    config,
    XSSPlugin
} from 'md-editor-rt';
import markdownItMark from 'markdown-it-mark';
import type MarkdownIt from 'markdown-it';

import {App} from './App';
import 'md-editor-rt/lib/style.css';
import './styles.css';

function editablePreviewTablePlugin(
    markdownIt: MarkdownIt
) {
    markdownIt.core.ruler.after(
        'block',
        'editable-preview-table',
        (state) => {
            state.tokens.forEach((token) => {
                if (
                    token.type !== 'table_open' ||
                    !token.map
                ) {
                    return;
                }

                token.attrJoin(
                    'class',
                    'editable-preview-table'
                );
                token.attrSet(
                    'data-md-table-end',
                    String(token.map[1])
                );
            });
        }
    );
}

function externalLinkPlugin(
    markdownIt: MarkdownIt
) {
    markdownIt.core.ruler.after(
        'inline',
        'external-link-behavior',
        (state) => {
            state.tokens.forEach((token) => {
                if (token.type !== 'inline') {
                    return;
                }

                token.children?.forEach((child) => {
                    if (child.type !== 'link_open') {
                        return;
                    }

                    const originalHref =
                        child.attrGet('href');

                    if (!originalHref) {
                        return;
                    }

                    const href = /^www\./i.test(originalHref)
                        ? `https://${originalHref}`
                        : originalHref;

                    if (href !== originalHref) {
                        child.attrSet('href', href);
                    }

                    if (/^https?:\/\//i.test(href)) {
                        child.attrSet('target', '_blank');
                        child.attrSet(
                            'rel',
                            'noopener noreferrer'
                        );
                    }
                });
            });
        }
    );
}

/*
 * md-editor-rt 默认对预览更新做 500ms 防抖。
 * 编辑内容已经由受控状态同步，这里设为 100ms 以便输入即渲染。
 */
config({
    /*
     * 按 md-editor-rt 的推荐方式，在 Markdown 编译阶段过滤
     * 原始 HTML。这样 <script> 等危险标签不会进入预览，
     * Mermaid 在随后生成的 SVG 也不会被二次过滤而丢失文字。
     */
    markdownItPlugins(plugins) {
        const pluginsWithToggleableTasks =
            plugins.map((item) => {
                if (item.type !== 'taskList') {
                    return item;
                }

                return {
                    ...item,
                    options: {
                        ...item.options,
                        /*
                         * 点击预览区的复选框时，自动把对应的
                         * Markdown 行在 - [ ] 与 - [x] 间切换。
                         */
                        enabled: true
                    }
                };
            });

        return [
            ...pluginsWithToggleableTasks,
            {
                type: 'editablePreviewTable',
                plugin: editablePreviewTablePlugin,
                options: {}
            },
            {
                type: 'externalLink',
                plugin: externalLinkPlugin,
                options: {}
            },
            {
                type: 'mark',
                plugin: markdownItMark,
                options: {}
            },
            {
                type: 'xss',
                plugin: XSSPlugin,
                options: {}
            }
        ];
    },
    editorConfig: {
        renderDelay: 100
    }
});

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('找不到 React 根节点 #root');
}

createRoot(rootElement).render(
    <StrictMode>
        <App/>
    </StrictMode>
);
