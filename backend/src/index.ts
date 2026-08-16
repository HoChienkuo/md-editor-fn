/**
 * 阶段一只建立可编译的后端工程。
 *
 * 阶段二会在这里创建 Express 服务，
 * 并监听飞牛 fnOS 提供的 Unix Socket。
 */

export const applicationInfo = {
    name: 'md-editor-fn',
    version: '0.1.0'
} as const;