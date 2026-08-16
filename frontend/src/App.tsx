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
import {useOpenDocument} from "./hooks/use-open-document";
import {MarkdownDocumentEditor} from "./components/MarkdownDocumentEditor";

type HealthResponse = {
    status: string;
    app: string;
    version: string;
    node: string;
    uptimeSeconds: number;
};

type HealthState =
    | {
    status: 'loading';
}
    | {
    status: 'success';
    health: HealthResponse;
}
    | {
    status: 'error';
    message: string;
};

function useHealthCheck(): HealthState {
    const [state, setState] = useState<HealthState>({
        status: 'loading'
    });

    useEffect(() => {
        const abortController = new AbortController();

        async function loadHealth(): Promise<void> {
            try {
                const response = await fetch(
                    './api/health',
                    {
                        headers: {
                            Accept: 'application/json'
                        },
                        signal: abortController.signal
                    }
                );

                if (!response.ok) {
                    throw new Error(
                        `HTTP ${response.status}`
                    );
                }

                const health =
                    await response.json() as HealthResponse;

                setState({
                    status: 'success',
                    health
                });
            } catch (error) {
                if (
                    error instanceof DOMException &&
                    error.name === 'AbortError'
                ) {
                    return;
                }

                setState({
                    status: 'error',
                    message:
                        error instanceof Error
                            ? error.message
                            : String(error)
                });
            }
        }

        void loadHealth();

        return () => {
            abortController.abort();
        };
    }, []);

    return state;
}

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

    return (
        <>
            <h1>{context.fileName}</h1>

            {state.status === 'loading' && (
                <p>正在检查文件授权和权限……</p>
            )}

            {state.status === 'error' && (
                <>
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
            )}

            {state.status === 'success' && (
                <>
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

                        <div>
                            <dt>读取权限</dt>
                            <dd>
                                {state.context.permissions.readable
                                    ? '允许'
                                    : '不允许'}
                            </dd>
                        </div>

                        <div>
                            <dt>写入权限</dt>
                            <dd>
                                {state.context.permissions.writable
                                    ? '允许'
                                    : '不允许'}
                            </dd>
                        </div>

                        <div>
                            <dt>删除权限</dt>
                            <dd>
                                {state.context.permissions.deletable
                                    ? '允许'
                                    : '不允许'}
                            </dd>
                        </div>
                    </dl>

                    {state.context.authorizationRequired && (
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
                    )}

                    {!state.context.authorizationRequired &&
                        state.context.permissions.readable && (
                            <p className="status-success">
                                文件授权与读取权限检查通过
                            </p>
                        )}

                    {authorizationMessage && (
                        <p className="secondary">
                            {authorizationMessage}
                        </p>
                    )}

                    <p className="secondary">
                        当前阶段只检查授权和权限，
                        暂时不会读取或修改文件内容。
                    </p>
                </>
            )}

            {documentState.state.status === 'loading' && (
                <p>正在读取 Markdown 文件……</p>
            )}

            {documentState.state.status === 'error' && (
                <div className="document-error">
                    <p className="status-error">
                        无法打开 Markdown 文件
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
                </div>
            )}

            {documentState.state.status === 'success' && (
                <MarkdownDocumentEditor
                    key={documentState.state.document.documentId}
                    openedDocument={documentState.state.document}
                />
            )}
        </>
    );
}

export function App() {
    const launchContext = useMemo(
        () => readLaunchContext(),
        []
    );
    useHealthCheck();
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