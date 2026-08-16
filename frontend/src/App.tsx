import {
    useEffect,
    useState
} from 'react';

type HealthResponse = {
    status: string;
    app: string;
    version: string;
    node: string;
    uptimeSeconds: number;
};

type LoadState =
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

export function App() {
    const [state, setState] = useState<LoadState>({
        status: 'loading'
    });

    useEffect(() => {
        const abortController = new AbortController();

        async function loadHealth() {
            try {
                /*
                 * 页面入口使用尾随斜杠：
                 * /app/md-editor-fn/
                 *
                 * 因此相对地址会解析为：
                 * /app/md-editor-fn/api/health
                 */
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
                        `健康检查失败：HTTP ${response.status}`
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

    return (
        <main className="app-shell">
            <section className="status-card">
                <h1>Markdown 编辑器</h1>

                {state.status === 'loading' && (
                    <p>正在连接后端服务……</p>
                )}

                {state.status === 'error' && (
                    <>
                        <p className="status-error">
                            后端服务连接失败
                        </p>

                        <p className="secondary">
                            {state.message}
                        </p>
                    </>
                )}

                {state.status === 'success' && (
                    <>
                        <p className="status-success">
                            后端服务运行正常
                        </p>

                        <dl className="health-details">
                            <div>
                                <dt>应用</dt>
                                <dd>{state.health.app}</dd>
                            </div>

                            <div>
                                <dt>版本</dt>
                                <dd>{state.health.version}</dd>
                            </div>

                            <div>
                                <dt>Node.js</dt>
                                <dd>{state.health.node}</dd>
                            </div>

                            <div>
                                <dt>运行时间</dt>
                                <dd>
                                    {state.health.uptimeSeconds} 秒
                                </dd>
                            </div>
                        </dl>

                        <p className="secondary">
                            文件打开和 Markdown 编辑功能将在后续阶段接入。
                        </p>
                    </>
                )}
            </section>
        </main>
    );
}