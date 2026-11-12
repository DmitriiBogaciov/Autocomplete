import type { JsonContext, JsonPath } from "./getJsonContext";
import type { JsonDocumentAnalysis } from "./analyzeJsonDocument";
import type { AutocompleteConfig } from "./configuration";
import type { DocumentSuggestions } from "./getDocumentSuggestions";

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

    // Conditions currently apply to object property values,
    // not individual array elements.
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

        // Do not infer a value when the property is missing or duplicated.
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
    getPriority: (suggestion: JsonSuggestion) => number = (suggestion) => suggestion.priority,
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

    const ranked = [...unique.values()].map((suggestion) => ({
        suggestion,
        startsWithQuery: normalize(suggestion.label).startsWith(query),
        score: getPriority(suggestion),
    }));

    ranked.sort((a, b) => {
        if (a.startsWithQuery !== b.startsWithQuery) {
            return a.startsWithQuery ? -1 : 1;
        }

        return (
            b.score - a.score ||
            a.suggestion.label.localeCompare(b.suggestion.label, "en")
        );
    });

    return ranked.map((item) => item.suggestion);
}

function calculateGroupBoosts(
    context: JsonContext,
    config: AutocompleteConfig,
    environment: RuleEnvironment,
): Map<string, number> {
    const boosts = new Map<string, number>();

    if (context.kind !== "property") {
        return boosts;
    }

    const currentObject = environment.analysis.objects.find(
        (object) =>
            object.start < environment.cursor &&
            environment.cursor <= object.end &&
            pathsEqual(object.path, context.path),
    );

    if (!currentObject) {
        return boosts;
    }

    const presentProperties = new Set(
        currentObject.properties.map((property) => property.name),
    );

    const factor = Number.isFinite(config.groupBoostFactor)
        ? Math.max(0, config.groupBoostFactor)
        : 0;

    for (const group of config.groups) {
        const members = new Map<string, number>();

        for (const rule of group.rules) {
            if (
                rule.kind !== "property" ||
                !matchesPath(rule.path, context.path)
            ) {
                continue;
            }

            for (const suggestion of rule.suggestions) {
                if (suggestion.kind !== "property") {
                    continue;
                }

                const configuredWeight = suggestion.contextWeight ?? 0;

                const weight = Number.isFinite(configuredWeight)
                    ? Math.max(0, configuredWeight)
                    : 0;

                // Count each property only once within a group.
                members.set(
                    suggestion.propertyName,
                    Math.max(
                        members.get(suggestion.propertyName) ?? 0,
                        weight,
                    ),
                );
            }
        }

        let groupScore = 0;

        for (const [name, weight] of members) {
            if (presentProperties.has(name)) {
                groupScore += weight;
            }
        }

        const groupBoost = groupScore * factor;

        for (const name of members.keys()) {
            // Shared properties receive the largest group boost.
            boosts.set(
                name,
                Math.max(boosts.get(name) ?? 0, groupBoost),
            );
        }
    }

    return boosts;
}

export function getConfiguredSuggestions(
    context: JsonContext,
    config: AutocompleteConfig,
    fromDocument: DocumentSuggestions,
    environment: RuleEnvironment,
): JsonSuggestion[] {
    const boosts = calculateGroupBoosts(
        context,
        config,
        environment,
    );

    return getJsonSuggestions(
        context,
        config.groups.flatMap((group) => group.rules),
        fromDocument.existingNames,
        fromDocument.siblingNames,
        fromDocument.valueSuggestions,
        environment,
        (suggestion) =>
            suggestion.priority +
            (
                suggestion.kind === "property"
                    ? boosts.get(suggestion.propertyName) ?? 0
                    : 0
            ),
    );
}