export type MarkdownFormatCommand =
    | 'bold'
    | 'italic'
    | 'strikethrough'
    | 'inline-code'
    | 'link';

export type MarkdownFormatResult = {
    value: string;
    selectionStart: number;
    selectionEnd: number;
};

function toggleWrapper(
    value: string,
    selectionStart: number,
    selectionEnd: number,
    opening: string,
    closing = opening
): MarkdownFormatResult {
    const selected = value.slice(selectionStart, selectionEnd);
    const hasWrapper =
        selectionStart >= opening.length &&
        value.slice(
            selectionStart - opening.length,
            selectionStart
        ) === opening &&
        value.slice(
            selectionEnd,
            selectionEnd + closing.length
        ) === closing;

    if (hasWrapper) {
        return {
            value:
                value.slice(0, selectionStart - opening.length) +
                selected +
                value.slice(selectionEnd + closing.length),
            selectionStart: selectionStart - opening.length,
            selectionEnd: selectionEnd - opening.length
        };
    }

    return {
        value:
            value.slice(0, selectionStart) +
            opening +
            selected +
            closing +
            value.slice(selectionEnd),
        selectionStart: selectionStart + opening.length,
        selectionEnd: selectionEnd + opening.length
    };
}

function getBacktickFence(value: string): string {
    const runs = value.match(/`+/g) ?? [];
    const longestRun = runs.reduce(
        (length, run) => Math.max(length, run.length),
        0
    );

    return '`'.repeat(longestRun + 1);
}

function applyLink(
    value: string,
    selectionStart: number,
    selectionEnd: number
): MarkdownFormatResult {
    const selected = value.slice(selectionStart, selectionEnd);

    if (
        selectionStart > 0 &&
        value[selectionStart - 1] === '[' &&
        value.slice(selectionEnd, selectionEnd + 2) === ']('
    ) {
        const destinationEnd = value.indexOf(')', selectionEnd + 2);

        if (destinationEnd >= 0) {
            return {
                value:
                    value.slice(0, selectionStart - 1) +
                    selected +
                    value.slice(destinationEnd + 1),
                selectionStart: selectionStart - 1,
                selectionEnd: selectionEnd - 1
            };
        }
    }

    if (/^https?:\/\/\S+$/i.test(selected)) {
        const label = '链接文字';
        const replacement = `[${label}](${selected})`;

        return {
            value:
                value.slice(0, selectionStart) +
                replacement +
                value.slice(selectionEnd),
            selectionStart: selectionStart + 1,
            selectionEnd: selectionStart + 1 + label.length
        };
    }

    if (selected) {
        const destination = 'https://';
        const replacement = `[${selected}](${destination})`;
        const destinationStart =
            selectionStart + selected.length + 3;

        return {
            value:
                value.slice(0, selectionStart) +
                replacement +
                value.slice(selectionEnd),
            selectionStart: destinationStart,
            selectionEnd: destinationStart + destination.length
        };
    }

    const label = '链接文字';
    const destination = 'https://';
    const replacement = `[${label}](${destination})`;

    return {
        value:
            value.slice(0, selectionStart) +
            replacement +
            value.slice(selectionEnd),
        selectionStart: selectionStart + 1,
        selectionEnd: selectionStart + 1 + label.length
    };
}

export function applyMarkdownFormat(
    value: string,
    selectionStart: number,
    selectionEnd: number,
    command: MarkdownFormatCommand
): MarkdownFormatResult {
    const start = Math.min(selectionStart, selectionEnd);
    const end = Math.max(selectionStart, selectionEnd);

    switch (command) {
        case 'bold':
            return toggleWrapper(value, start, end, '**');
        case 'italic':
            return toggleWrapper(value, start, end, '*');
        case 'strikethrough':
            return toggleWrapper(value, start, end, '~~');
        case 'inline-code': {
            const fence = getBacktickFence(value.slice(start, end));
            return toggleWrapper(value, start, end, fence);
        }
        case 'link':
            return applyLink(value, start, end);
    }
}
