import {
    useEffect
} from 'react';

import {
    setFnosExitPageTips
} from '../services/fnos-sdk';

export function useUnsavedChanges(
    hasUnsavedChanges: boolean
): void {
    /*
     * fnOS 微应用窗口关闭提示。
     */
    useEffect(() => {
        void setFnosExitPageTips(
            hasUnsavedChanges
        ).catch((error: unknown) => {
            console.warn(
                '无法设置 fnOS 退出提示',
                error
            );
        });

        return () => {
            if (hasUnsavedChanges) {
                void setFnosExitPageTips(
                    false
                ).catch(() => {
                    // 页面正在卸载时忽略清理失败。
                });
            }
        };
    }, [hasUnsavedChanges]);

    /*
     * 普通浏览器刷新、关闭标签页提示。
     */
    useEffect(() => {
        if (!hasUnsavedChanges) {
            return;
        }

        const handleBeforeUnload = (
            event: BeforeUnloadEvent
        ) => {
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener(
            'beforeunload',
            handleBeforeUnload
        );

        return () => {
            window.removeEventListener(
                'beforeunload',
                handleBeforeUnload
            );
        };
    }, [hasUnsavedChanges]);
}