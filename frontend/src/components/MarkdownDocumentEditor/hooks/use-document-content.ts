import {
    useCallback,
    useEffect,
    useRef,
    useState
} from 'react';

export function useDocumentContent(
    initialContent: string,
    isReadOnly: boolean
) {
    const [content, setContent] = useState(initialContent);
    const contentRef = useRef(initialContent);
    const savedContentRef = useRef(initialContent);
    const [hasUnsavedChanges, setHasUnsavedChanges] =
        useState(false);
    const [contentLength, setContentLength] =
        useState(initialContent.length);
    const lengthTimerRef = useRef<number | null>(null);

    const updateContent = useCallback((nextContent: string) => {
        setContent(nextContent);
        contentRef.current = nextContent;
        setHasUnsavedChanges(
            !isReadOnly &&
            nextContent !== savedContentRef.current
        );

        if (lengthTimerRef.current !== null) {
            window.clearTimeout(lengthTimerRef.current);
        }

        lengthTimerRef.current = window.setTimeout(() => {
            setContentLength(contentRef.current.length);
        }, 300);
    }, [isReadOnly]);

    useEffect(() => {
        return () => {
            if (lengthTimerRef.current !== null) {
                window.clearTimeout(lengthTimerRef.current);
            }
        };
    }, []);

    return {
        content,
        contentRef,
        savedContentRef,
        hasUnsavedChanges,
        setHasUnsavedChanges,
        contentLength,
        updateContent
    };
}
