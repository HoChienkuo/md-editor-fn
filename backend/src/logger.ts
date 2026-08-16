type LogData = Record<string, unknown>;

function serializeData(data?: LogData): string {
    if (!data) {
        return '';
    }

    try {
        return ` ${JSON.stringify(data)}`;
    } catch {
        return ' {"serializationError":true}';
    }
}

function write(
    level: 'INFO' | 'WARN' | 'ERROR',
    message: string,
    data?: LogData
): void {
    const timestamp = new Date().toISOString();

    process.stdout.write(
        `${timestamp} [${level}] ${message}${serializeData(data)}\n`
    );
}

export const logger = {
    info(message: string, data?: LogData): void {
        write('INFO', message, data);
    },

    warn(message: string, data?: LogData): void {
        write('WARN', message, data);
    },

    error(message: string, data?: LogData): void {
        write('ERROR', message, data);
    }
};