import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {
    config,
    XSSPlugin
} from 'md-editor-rt';

import {App} from './App';
import 'md-editor-rt/lib/style.css';
import './styles.css';

/*
 * md-editor-rt 默认对预览更新做 500ms 防抖。
 * 编辑内容已经由受控状态同步，这里设为 0 以便输入即渲染。
 */
config({
    /*
     * 按 md-editor-rt 的推荐方式，在 Markdown 编译阶段过滤
     * 原始 HTML。这样 <script> 等危险标签不会进入预览，
     * Mermaid 在随后生成的 SVG 也不会被二次过滤而丢失文字。
     */
    markdownItPlugins(plugins) {
        return [
            ...plugins,
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
