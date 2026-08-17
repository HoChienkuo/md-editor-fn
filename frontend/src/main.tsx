import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {config} from 'md-editor-rt';

import {App} from './App';
import 'md-editor-rt/lib/style.css';
import './styles.css';

/*
 * md-editor-rt 默认对预览更新做 500ms 防抖。
 * 编辑内容已经由受控状态同步，这里设为 0 以便输入即渲染。
 */
config({
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
