import type { JsonContext, JsonPath } from "./getJsonContext";

type JsonScalar = string | number | boolean | null;

export type JsonSuggestion =
    | {
        kind: "property";
        id: string;
        label: string;
        description: string;
        priority: number;
        propertyName: string;
    }
    | {
        kind: "value";
        id: string;
        label: string;
        description: string;
        priority: number;
        value: JsonScalar;
    };

export type JsonSuggestionRule = {
    kind: "property" | "value";

    // null в шаблоне означает любой индекс массива.
    path: Array<string | null>;

    suggestions: JsonSuggestion[];
};

function matchesPath(
    pattern: Array<string | null>,
    actual: JsonPath,
): boolean {
    if (pattern.length !== actual.length) {
        return false;
    }

    return pattern.every((part, index) =>
        part === null
            ? typeof actual[index] === "number"
            : part === actual[index]
    );
}

function normalize(text: string): string {
    return text.normalize("NFC").trim().toLowerCase();
}

export function getJsonSuggestions(
    context: JsonContext,
    rules: JsonSuggestionRule[],
    existingPropertyNames: readonly string[] = [],
): JsonSuggestion[] {
    if (context.kind === "none") {
        return [];
    }

    const existingProperties = new Set(existingPropertyNames);

    const query = normalize(context.query);

    const candidates = rules
        .filter(
            (rule) =>
                rule.kind === context.kind &&
                matchesPath(rule.path, context.path),
        )
        .flatMap((rule) => rule.suggestions)
        .filter((suggestion) => suggestion.kind === context.kind);

    const unique = new Map<string, JsonSuggestion>();

    for (const suggestion of candidates) {
        if (
            suggestion.kind === "property" &&
            existingProperties.has(suggestion.propertyName)
        ) {
            continue;
        }
        const searchableText = normalize(
            `${suggestion.label} ${suggestion.description}`,
        );

        if (!searchableText.includes(query)) {
            continue;
        }

        const identity =
            suggestion.kind === "property"
                ? `property:${suggestion.propertyName}`
                : `value:${JSON.stringify(suggestion.value)}`;

        const existing = unique.get(identity);

        if (!existing || suggestion.priority > existing.priority) {
            unique.set(identity, suggestion);
        }
    }

    return [...unique.values()].sort((a, b) => {
        const aStartsWithQuery = normalize(a.label).startsWith(query);
        const bStartsWithQuery = normalize(b.label).startsWith(query);

        if (aStartsWithQuery !== bStartsWithQuery) {
            return aStartsWithQuery ? -1 : 1;
        }

        return (
            b.priority - a.priority ||
            a.label.localeCompare(b.label, "en")
        );
    });
}