import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

import {App} from './App';
import 'md-editor-rt/lib/style.css';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('找不到 React 根节点 #root');
}

createRoot(rootElement).render(
    <StrictMode>
        <App/>
    </StrictMode>
);