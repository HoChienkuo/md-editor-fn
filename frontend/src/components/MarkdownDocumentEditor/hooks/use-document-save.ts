import {
    useCallback,
    useEffect,
    useRef,
    useState
} from 'react';
import type {
    Dispatch,
    SetStateAction
} from 'react';

import {
    saveDocument
} from '../../../services/document-api';
import type {
    DocumentVersion
} from '../../../services/document-api';
import {
    ApiRequestError
} from '../../../services/api-client';

type StringRef = {
    current: string;
};

type UseDocumentSaveOptions = {
    documentId: string;
    initialVersion: DocumentVersion;
    isReadOnly: boolean;
    contentRef: StringRef;
    savedContentRef: StringRef;
    setHasUnsavedChanges: Dispatch<SetStateAction<boolean>>;
};

export type SaveMode = 'manual' | 'auto';

export function useDocumentSave({
    documentId,
    initialVersion,
    isReadOnly,
    contentRef,
    savedContentRef,
    setHasUnsavedChanges
}: UseDocumentSaveOptions) {
    const [currentVersion, setCurrentVersion] =
        useState<DocumentVersion>(initialVersion);
    const [isSaving, setIsSaving] = useState(false);
    const [hasConflict, setHasConflict] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');
    const autoSaveTimerRef = useRef<number | null>(null);

    const saveCurrentContent = useCallback(async (
        contentToSave: string,
        mode: SaveMode
    ) => {
        if (isReadOnly || isSaving || hasConflict) {
            return;
        }

        if (contentToSave === savedContentRef.current) {
            if (mode === 'manual') {
                setSaveMessage('当前没有需要保存的修改');
            }

            return;
        }

        setIsSaving(true);

        if (mode === 'manual') {
            setSaveMessage('正在保存……');
        }

        try {
            const result = await saveDocument(
                documentId,
                contentToSave,
                currentVersion
            );

            /*
             * 保存期间仍可能继续输入，因此只把实际发送的内容
             * 设为保存基准。
             */
            savedContentRef.current = contentToSave;
            setCurrentVersion(result.version);
            setHasUnsavedChanges(
                contentRef.current !== contentToSave
            );
            setSaveMessage(
                mode === 'auto' ? '已自动保存' : '保存成功'
            );
        } catch (error) {
            if (
                error instanceof ApiRequestError &&
                error.errorType === 'DOCUMENT_CONFLICT'
            ) {
                setHasConflict(true);
                setSaveMessage(
                    '磁盘文件已被其他用户或程序修改。为避免覆盖，自动保存已经暂停，请先复制当前内容并重新打开文件。'
                );
                return;
            }

            setSaveMessage(
                error instanceof Error
                    ? `保存失败：${error.message}`
                    : '保存失败，请稍后重试'
            );
        } finally {
            setIsSaving(false);
        }
    }, [
        contentRef,
        currentVersion,
        documentId,
        hasConflict,
        isReadOnly,
        isSaving,
        savedContentRef,
        setHasUnsavedChanges
    ]);

    const saveCurrentContentRef = useRef(saveCurrentContent);

    useEffect(() => {
        saveCurrentContentRef.current = saveCurrentContent;
    }, [saveCurrentContent]);

    const handleContentChanged = useCallback((nextContent: string) => {
        if (!hasConflict) {
            setSaveMessage('');
        }

        if (autoSaveTimerRef.current !== null) {
            window.clearTimeout(autoSaveTimerRef.current);
        }

        if (
            !isReadOnly &&
            !hasConflict &&
            nextContent !== savedContentRef.current
        ) {
            autoSaveTimerRef.current = window.setTimeout(() => {
                void saveCurrentContentRef.current(
                    contentRef.current,
                    'auto'
                );
            }, 60 * 1000);
        }
    }, [
        contentRef,
        hasConflict,
        isReadOnly,
        savedContentRef
    ]);

    useEffect(() => {
        return () => {
            if (autoSaveTimerRef.current !== null) {
                window.clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, []);

    return {
        isSaving,
        hasConflict,
        saveMessage,
        setSaveMessage,
        saveCurrentContent,
        saveCurrentContentRef,
        handleContentChanged
    };
}
