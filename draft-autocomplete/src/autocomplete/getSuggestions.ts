export function getSuggestions(
    prefix: string,
    words: readonly string[],
    limit: number = 5,
): string[] {
    const normalizedPrefix = prefix.normalize("NFC").toLowerCase();
    
    if (!normalizedPrefix || !Number.isInteger(limit) || limit <= 0) {
        return [];
    }

    const suggestions: string[] = [];

    for (const word of words) {
        const normalizedWord = word.normalize("NFC").toLowerCase();

        if (
            normalizedWord.startsWith(normalizedPrefix) &&
            normalizedWord !== normalizedPrefix
        ) {
            suggestions.push(word);

            if (suggestions.length >= limit) {
                break;
            }
        }
    }

    return suggestions;
}