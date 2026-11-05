export type WordContext = {
    prefix: string;
    word: string;
    start: number;
    end: number;
}

export function getWordContext(text: string, cursor: number): WordContext | null {
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > text.length) {
        return null;
    }

    const words = [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*/gu)];

    // console.log(`Text: "${text}", Cursor: ${cursor}, Words: ${words.map(m => m[0]).join(", ")}`);

    for (const match of words) {
        const start = match.index;
        const word = match[0];
        const end = start + word.length;

        // console.log(`Word: ${word}, Start: ${start}, End: ${end}, Cursor: ${cursor}`);

        if (start < cursor && cursor <= end) {
            return {
                prefix: text.slice(start, cursor),
                word,
                start,
                end
            }
        }
    }

    return null;
}
