import {
    useCallback,
    useEffect,
    useState
} from 'react';

import {
    requestFileContext,
    type FileContext
} from '../services/file-context-api';

type FileContextState =
    | {
    status: 'loading';
}
    | {
    status: 'success';
    context: FileContext;
}
    | {
    status: 'error';
    message: string;
};

export function useFileContext(
    path: string | undefined
) {
    const [
        state,
        setState
    ] = useState<FileContextState>({
        status: 'loading'
    });

    const refresh = useCallback(
        async () => {
            if (!path) {
                return;
            }

            setState({
                status: 'loading'
            });

            try {
                const context =
                    await requestFileContext(
                        path,
                        navigator.language || 'zh-CN'
                    );

                setState({
                    status: 'success',
                    context
                });
            } catch (error) {
                setState({
                    status: 'error',
                    message:
                        error instanceof Error
                            ? error.message
                            : String(error)
                });
            }
        },
        [path]
    );

    useEffect(
        () => {
            void refresh();
        },
        [refresh]
    );

    return {
        state,
        refresh
    };
}