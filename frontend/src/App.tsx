import {
    useEffect,
    useMemo,
    useState
} from 'react';

import {
    readLaunchContext,
    type LaunchContext
} from './services/launch-context';

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
                            context,
                            healthState
                        }: {
    context: Extract<
        LaunchContext,
        {
            type: 'file';
        }
    >;
    healthState: HealthState;
}) {
    return (
        <>
            <h1>{context.fileName}</h1>

            <p className="status-success">
                已收到 fnOS 文件打开请求
            </p>

            <dl className="launch-details">
                <div>
                    <dt>文件名</dt>
                    <dd>{context.fileName}</dd>
                </div>

                <div>
                    <dt>扩展名</dt>
                    <dd>.{context.extension}</dd>
                </div>

                <div>
                    <dt>文件路径</dt>
                    <dd>{context.path}</dd>
                </div>

                <div>
                    <dt>后端服务</dt>

                    <dd>
                        {healthState.status === 'loading' && (
                            '正在检查……'
                        )}

                        {healthState.status === 'success' && (
                            `运行正常，Node.js ${healthState.health.node}`
                        )}

                        {healthState.status === 'error' && (
                            `连接失败：${healthState.message}`
                        )}
                    </dd>
                </div>
            </dl>

            <p className="secondary">
                当前阶段只验证文件入口和 path 参数，
                暂时不会读取或修改这个文件。
            </p>
        </>
    );
}

export function App() {
    const launchContext = useMemo(
        () => readLaunchContext(),
        []
    );

    const healthState = useHealthCheck();

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
                    <MissingPathView />
                )}

                {launchContext.type === 'invalid-path' && (
                    <InvalidPathView
                        context={launchContext}
                    />
                )}

                {launchContext.type === 'file' && (
                    <FileLaunchView
                        context={launchContext}
                        healthState={healthState}
                    />
                )}
            </section>
        </main>
    );
}