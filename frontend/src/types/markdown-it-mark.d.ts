declare module 'markdown-it-mark' {
    import type MarkdownIt from 'markdown-it';

    function markdownItMark(
        markdownIt: MarkdownIt
    ): void;

    export default markdownItMark;
}
