const pathLocks = new Map<
    string,
    Promise<void>
>();

export async function withPathLock<T>(
    path: string,
    task: () => Promise<T>
): Promise<T> {
    const previous =
        pathLocks.get(path) ??
        Promise.resolve();

    let releaseLock!: () => void;

    const current = new Promise<void>(
        (resolve) => {
            releaseLock = resolve;
        }
    );

    pathLocks.set(path, current);

    await previous;

    try {
        return await task();
    } finally {
        releaseLock();

        if (pathLocks.get(path) === current) {
            pathLocks.delete(path);
        }
    }
}