import {useEffect} from 'react';

export function useUnsavedChanges(hasUnsavedChanges: boolean): void {
    useEffect(() => {
        if (!hasUnsavedChanges) {
            return;
        }

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();

            // 兼容部分浏览器。
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener(
                'beforeunload',
                handleBeforeUnload,
            );
        };
    }, [hasUnsavedChanges]);
}