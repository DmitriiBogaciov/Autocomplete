import type { JsonContext, JsonPath } from "./getJsonContext";
import type { JsonDocumentAnalysis } from "./analyzeJsonDocument";

type JsonScalar = string | number | boolean | null;

export type JsonSuggestion =
    | {
        kind: "property";
        id: string;
        label: string;
        description: string;
        priority: number;
        propertyName: string;
        contextWeight?: number;
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
    path: Array<string | null>;

    when?: Array<{
        property: string;
        equals: JsonScalar;
    }>;

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

export type RuleEnvironment = {
    analysis: JsonDocumentAnalysis;
    cursor: number;
};

function pathsEqual(
    first: JsonPath,
    second: JsonPath,
): boolean {
    return (
        first.length === second.length &&
        first.every((part, index) => part === second[index])
    );
}

function matchesConditions(
    rule: JsonSuggestionRule,
    context: JsonContext,
    environment?: RuleEnvironment,
): boolean {
    if (!rule.when || rule.when.length === 0) {
        return true;
    }

    if (
        !environment ||
        context.kind !== "value" ||
        context.path.length === 0
    ) {
        return false;
    }

    const lastPart = context.path[context.path.length - 1];

    // Пока условия поддерживаем для значений свойств объекта,
    // а не для отдельных элементов массива.
    if (typeof lastPart !== "string") {
        return false;
    }

    const objectPath = context.path.slice(0, -1);

    const currentObject = environment.analysis.objects.find(
        (object) =>
            pathsEqual(object.path, objectPath) &&
            object.start < environment.cursor &&
            environment.cursor <= object.end,
    );

    if (!currentObject) {
        return false;
    }

    return rule.when.every((condition) => {
        const properties = currentObject.properties.filter(
            (property) => property.name === condition.property,
        );

        // При отсутствии или повторении ключа не угадываем значение.
        if (properties.length !== 1) {
            return false;
        }

        const expectedPath = [
            ...objectPath,
            condition.property,
        ];

        const values = environment.analysis.values.filter(
            (entry) =>
                pathsEqual(entry.path, expectedPath) &&
                entry.start > currentObject.start &&
                entry.end <= currentObject.end,
        );

        return (
            values.length === 1 &&
            values[0].value === condition.equals
        );
    });
}

export function getJsonSuggestions(
    context: JsonContext,
    rules: JsonSuggestionRule[],
    existingPropertyNames: readonly string[] = [],
    siblingPropertyNames: readonly string[] = [],
    documentValueSuggestions: readonly JsonSuggestion[] = [],
    environment?: RuleEnvironment,
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
                matchesPath(rule.path, context.path) &&
                matchesConditions(rule, context, environment),
        )
        .flatMap((rule) => rule.suggestions)
        .filter((suggestion) => suggestion.kind === context.kind);

    if (context.kind === "property") {
        for (const name of siblingPropertyNames) {
            const alreadyIncluded = candidates.some(
                (suggestion) =>
                    suggestion.kind === "property" &&
                    suggestion.propertyName === name,
            );

            if (alreadyIncluded) {
                continue;
            }

            candidates.push({
                kind: "property",
                id: `document-property:${name}`,
                label: name,
                description: "Used at a similar location in this document.",
                priority: -1,
                propertyName: name,
            });
        }
    }

    if (context.kind === "value") {
        candidates.push(
            ...documentValueSuggestions.filter(
                (suggestion) => suggestion.kind === "value",
            ),
        );
    }

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