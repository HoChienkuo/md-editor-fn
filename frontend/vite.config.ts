import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],

    /*
     * 使用相对资源地址。
     *
     * 后续应用会被挂载到类似：
     * /app/md-editor-fn/
     *
     * 如果这里使用默认的 "/"，生成的静态资源地址会变成：
     * /assets/index.js
     *
     * 这可能绕过应用网关前缀。
     */
    base: './',

    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false,
        target: 'es2022'
    }
});