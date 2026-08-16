import {
    useEffect,
    useMemo,
    useState
} from 'react';

import {
    useFileContext
} from './hooks/use-file-context';

import {
    authorizeKnownFile
} from './services/fnos-sdk';

import {
    readLaunchContext,
    type LaunchContext
} from './services/launch-context';
import {
    useOpenDocument
} from './hooks/use-open-document';
import {
    MarkdownDocumentEditor
} from './components/MarkdownDocumentEditor';

function MissingPathView() {
    return (
        <>
            <h1>Markdown 编辑器</h1>

            <p className="status-warning">
                没有指定要打开的文件
            </p>

            <p className="secondary">
                请在飞牛文件管理器中选择一个 .md 或
                .markdown 文件，并使用 Markdown 编辑器打开。
            </p>
        </>
    );
}

function InvalidPathView({
                             context
                         }: {
    context: Extract<
        LaunchContext,
        {
            type: 'invalid-path';
        }
    >;
}) {
    return (
        <>
            <h1>无法打开文件</h1>

            <p className="status-error">
                启动参数无效
            </p>

            <p className="secondary">
                {context.reason}
            </p>
        </>
    );
}

function FileLaunchView({
                            context
                        }: {
    context: Extract<
        LaunchContext,
        {
            type: 'file';
        }
    >;
}) {
    const {
        state,
        refresh
    } = useFileContext(context.path);

    const canOpen =
        state.status === 'success' &&
        state.context.permissions.readable;

    const documentState =
        useOpenDocument(
            context.path,
            canOpen
        );

    const [
        authorizationMessage,
        setAuthorizationMessage
    ] = useState('');

    const [
        authorizing,
        setAuthorizing
    ] = useState(false);

    async function authorize(): Promise<void> {
        setAuthorizing(true);
        setAuthorizationMessage('');

        try {
            await authorizeKnownFile(
                context.path
            );

            setAuthorizationMessage(
                '授权完成，正在重新检查权限……'
            );

            await refresh();
        } catch (error) {
            setAuthorizationMessage(
                error instanceof Error
                    ? error.message
                    : String(error)
            );
        } finally {
            setAuthorizing(false);
        }
    }

    if (state.status === 'loading') {
        return (
            <>
                <h1>{context.fileName}</h1>
                <p>正在检查文件权限……</p>
            </>
        );
    }

    if (state.status === 'error') {
        return (
            <>
                <h1>无法打开文件</h1>

                <p className="status-error">
                    无法检查文件权限
                </p>

                <p className="secondary">
                    {state.message}
                </p>

                <button
                    type="button"
                    onClick={() => {
                        void refresh();
                    }}
                >
                    重试
                </button>
            </>
        );
    }

    if (state.context.authorizationRequired) {
        return (
            <>
                <h1>{context.fileName}</h1>

                <dl className="launch-details">
                    <div>
                        <dt>文件名</dt>
                        <dd>{context.fileName}</dd>
                    </div>

                    <div>
                        <dt>位置</dt>
                        <dd>
                            {state.context.semanticPath ||
                                context.fileName}
                        </dd>
                    </div>
                </dl>

                <div className="authorization-panel">
                    <p>
                        Markdown 编辑器需要获得此文件的访问授权。
                    </p>

                    <button
                        type="button"
                        disabled={authorizing}
                        onClick={() => {
                            void authorize();
                        }}
                    >
                        {authorizing
                            ? '正在授权……'
                            : '授权此文件'}
                    </button>
                </div>

                {authorizationMessage && (
                    <p className="secondary">
                        {authorizationMessage}
                    </p>
                )}
            </>
        );
    }

    if (documentState.state.status === 'error') {
        return (
            <>
                <h1>无法打开文件</h1>

                <p className="status-error">
                    无法读取 Markdown 文件
                </p>

                <p className="secondary">
                    {documentState.state.message}
                </p>

                <button
                    type="button"
                    onClick={() => {
                        void documentState.reload();
                    }}
                >
                    重新读取
                </button>
            </>
        );
    }

    if (documentState.state.status === 'success') {
        return (
            <MarkdownDocumentEditor
                key={documentState.state.document.documentId}
                openedDocument={documentState.state.document}
            />
        );
    }

    return (
        <>
            <h1>{context.fileName}</h1>
            <p>正在读取 Markdown 文件……</p>
        </>
    );
}

export function App() {
    const launchContext = useMemo(
        () => readLaunchContext(),
        []
    );
    useEffect(() => {
        if (launchContext.type === 'file') {
            document.title =
                `${launchContext.fileName} - Markdown 编辑器`;

            return;
        }

        document.title = 'Markdown 编辑器';
    }, [launchContext]);

    return (
        <main className="app-shell">
            <section className="status-card">
                {launchContext.type === 'missing-path' && (
                    <MissingPathView/>
                )}

                {launchContext.type === 'invalid-path' && (
                    <InvalidPathView
                        context={launchContext}
                    />
                )}

                {launchContext.type === 'file' && (
                    <FileLaunchView
                        context={launchContext}
                    />
                )}
            </section>
        </main>
    );
}
