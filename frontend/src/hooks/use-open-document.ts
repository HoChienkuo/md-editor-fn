import {
    useCallback,
    useEffect,
    useState
} from 'react';

import {
    openDocument,
    type OpenedDocument
} from '../services/document-api';

type OpenDocumentState =
    | {
    status: 'idle';
}
    | {
    status: 'loading';
}
    | {
    status: 'success';
    document: OpenedDocument;
}
    | {
    status: 'error';
    message: string;
};

export function useOpenDocument(
    path: string,
    enabled: boolean
) {
    const [
        state,
        setState
    ] = useState<OpenDocumentState>({
        status: 'idle'
    });

    const reload = useCallback(
        async () => {
            if (!enabled) {
                setState({
                    status: 'idle'
                });

                return;
            }

            setState({
                status: 'loading'
            });

            try {
                const document =
                    await openDocument(
                        path,
                        navigator.language || 'zh-CN'
                    );

                setState({
                    status: 'success',
                    document
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
        [
            enabled,
            path
        ]
    );

    useEffect(
        () => {
            void reload();
        },
        [reload]
    );

    return {
        state,
        reload
    };
}