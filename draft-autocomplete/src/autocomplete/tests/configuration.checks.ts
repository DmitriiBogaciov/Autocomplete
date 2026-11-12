import {
    parseSuggestionGroup,
} from "../configuration";

import type { AutocompleteConfig } from "../configuration";

import { getJsonContext } from "../getJsonContext";
import { analyzeJsonDocument } from "../analyzeJsonDocument";
import { getDocumentSuggestions } from "../getDocumentSuggestions";
import { getConfiguredSuggestions } from "../suggestions";

function assert(
    condition: unknown,
    message: string,
): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual(actual: unknown, expected: unknown) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            `Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
        );
    }
}

function expectError(action: () => unknown, messagePart: string) {
    let caught: unknown;

    try {
        action();
    } catch (error) {
        caught = error;
    }

    assert(caught instanceof Error, "Expected an error");

    assert(
        caught.message.includes(messagePart),
        `Expected an error containing "${messagePart}", received "${caught.message}"`,
    );
}

const apiSource = {
    id: "api",
    label: "API",
    objectPaths: [[], [null]],
    properties: [
        {
            name: "method",
            priority: 10,
            contextWeight: 3,
            values: [
                { value: "GET", priority: 10 },
                { value: "POST", priority: 5 },
            ],
        },
        {
            name: "path",
            priority: 9,
            contextWeight: 2,
        },
        {
            name: "description",
            priority: 6,
            contextWeight: 0,
            values: [
                {
                    value: "Returns data.",
                    when: [
                        { property: "method", equals: "GET" },
                    ],
                },
            ],
        },
    ],
};

const productsSource = {
    id: "products",
    label: "Products",
    objectPaths: [[], [null]],
    properties: [
        {
            name: "sku",
            priority: 10,
            contextWeight: 3,
        },
        {
            name: "price",
            priority: 9,
            contextWeight: 2,
            values: [
                { value: 100 },
                { value: "100" },
            ],
        },
        {
            name: "description",
            priority: 6,
            contextWeight: 0,
        },
    ],
};

const config: AutocompleteConfig = {
    groupBoostFactor: 10,
    groups: [
        parseSuggestionGroup(apiSource),
        parseSuggestionGroup(productsSource),
    ],
};

function suggest(
    markedText: string,
    configuration = config,
) {
    const cursor = markedText.indexOf("│");

    assert(
        cursor >= 0 &&
        markedText.indexOf("│", cursor + 1) === -1,
        "Expected exactly one cursor marker",
    );

    const text =
        markedText.slice(0, cursor) +
        markedText.slice(cursor + 1);

    const context = getJsonContext(text, cursor);
    const analysis = analyzeJsonDocument(text);

    const fromDocument = getDocumentSuggestions(
        analysis,
        context,
        cursor,
    );

    return getConfiguredSuggestions(
        context,
        configuration,
        fromDocument,
        { analysis, cursor },
    );
}

function propertyNames(markedText: string): string[] {
    return suggest(markedText).flatMap((suggestion) =>
        suggestion.kind === "property"
            ? [suggestion.propertyName]
            : []
    );
}

function values(markedText: string) {
    return suggest(markedText).flatMap((suggestion) =>
        suggestion.kind === "value"
            ? [suggestion.value]
            : []
    );
}

type TestCase = {
    name: string;
    run: () => void;
};

const cases: TestCase[] = [
    {
        name: "Configuration generates rules for every object path",
        run() {
            const group = parseSuggestionGroup(apiSource);

            const methodPaths = group.rules
                .filter(
                    (rule) =>
                        rule.kind === "property" &&
                        rule.suggestions.some(
                            (suggestion) =>
                                suggestion.kind === "property" &&
                                suggestion.propertyName === "method",
                        ),
                )
                .map((rule) => rule.path);

            assertEqual(methodPaths, [[], [null]]);
        },
    },
    {
        name: "Optional configuration fields use defaults",
        run() {
            const group = parseSuggestionGroup({
                id: "minimal",
                objectPaths: [[]],
                properties: [{ name: "custom" }],
            });

            assertEqual(group.label, "minimal");
            assertEqual(group.rules.length, 1);

            const suggestion = group.rules[0].suggestions[0];

            assert(suggestion.kind === "property", "Expected a property");

            assertEqual(suggestion.priority, 0);
            assertEqual(suggestion.contextWeight, 0);
            assertEqual(suggestion.description, "");
        },
    },
    {
        name: "Array item values receive an index wildcard",
        run() {
            const group = parseSuggestionGroup({
                id: "errors",
                objectPaths: [[]],
                properties: [
                    {
                        name: "errors",
                        arrayItems: true,
                        values: [{ value: "Not found" }],
                    },
                ],
            });

            const rule = group.rules.find(
                (item) => item.kind === "value",
            );

            assert(rule, "Expected a value rule");
            assertEqual(rule.path, ["errors", null]);
        },
    },
    {
        name: "Invalid context weight is rejected",
        run() {
            expectError(
                () =>
                    parseSuggestionGroup({
                        id: "invalid",
                        objectPaths: [[]],
                        properties: [
                            { name: "method", contextWeight: "high" },
                        ],
                    }),
                "contextWeight",
            );
        },
    },
    {
        name: "Negative context weight is rejected",
        run() {
            expectError(
                () =>
                    parseSuggestionGroup({
                        id: "invalid",
                        objectPaths: [[]],
                        properties: [
                            { name: "method", contextWeight: -1 },
                        ],
                    }),
                "contextWeight",
            );
        },
    },
    {
        name: "Duplicate property definitions are rejected",
        run() {
            expectError(
                () =>
                    parseSuggestionGroup({
                        id: "invalid",
                        objectPaths: [[]],
                        properties: [
                            { name: "method" },
                            { name: "method" },
                        ],
                    }),
                "method",
            );
        },
    },
    {
        name: "Object values are rejected by the scalar configuration",
        run() {
            expectError(
                () =>
                    parseSuggestionGroup({
                        id: "invalid",
                        objectPaths: [[]],
                        properties: [
                            {
                                name: "author",
                                values: [{ value: { name: "Alice" } }],
                            },
                        ],
                    }),
                "value",
            );
        },
    },
    {
        name: "Empty object includes all groups without duplicates",
        run() {
            const names = propertyNames("{│}");

            assertEqual(
                [...names].sort(),
                ["description", "method", "path", "price", "sku"],
            );

            assertEqual(new Set(names).size, names.length);
        },
    },
    {
        name: "Method boosts API properties",
        run() {
            const names = propertyNames('{"method": "GET", │}');

            assertEqual(names.slice(0, 2), ["path", "description"]);
            assert(!names.includes("method"), "Existing property must be excluded");
        },
    },
    {
        name: "SKU boosts product properties",
        run() {
            const names = propertyNames('{"sku": "ABC", │}');

            assertEqual(names.slice(0, 2), ["price", "description"]);
            assert(!names.includes("sku"), "Existing property must be excluded");
        },
    },
    {
        name: "A shared property does not activate either group",
        run() {
            const names = propertyNames('{"description": "", │}');

            assertEqual(names, ["method", "sku", "path", "price"]);
        },
    },
    {
        name: "Nested signals do not boost the outer object",
        run() {
            assertEqual(
                propertyNames('{"metadata": {"method": "GET"}, │}'),
                propertyNames("{│}"),
            );
        },
    },
    {
        name: "A neighboring object does not activate the current group",
        run() {
            assertEqual(
                propertyNames('[{"method": "GET"}, {│}]'),
                propertyNames("{│}"),
            );
        },
    },
    {
        name: "Shared properties receive the maximum boost, not the sum",
        run() {
            const names = propertyNames(
                '{"method": "GET", "sku": "ABC", │}',
            );

            assertEqual(names, ["path", "price", "description"]);
        },
    },
    {
        name: "Compiled conditions select the correct value",
        run() {
            assertEqual(
                values('{"method": "GET", "description": "│"}'),
                ["Returns data."],
            );

            assertEqual(
                values('{"method": "POST", "description": "│"}'),
                [],
            );
        },
    },
    {
        name: "Compiled values preserve scalar types",
        run() {
            const result = values('{"price": │}');

            assert(result.includes(100), "Expected the number 100");
            assert(result.includes("100"), 'Expected the string "100"');
            assertEqual(result.length, 2);
        },
    },
    {
        name: "Repeated queries do not mutate configuration or accumulate boosts",
        run() {
            const before = JSON.stringify(config);
            const first = propertyNames('{"method": "GET", │}');
            const second = propertyNames('{"method": "GET", │}');

            assertEqual(second, first);
            assertEqual(JSON.stringify(config), before);
        },
    },
];

export function runConfigurationChecks() {
    let passed = 0;

    for (const test of cases) {
        try {
            test.run();
            passed++;
            console.log(`✓ ${test.name}`);
        } catch (error) {
            console.error(`✗ ${test.name}`, error);
        }
    }

    console.log(`Configuration checks: ${passed}/${cases.length} passed`);

    return {
        passed,
        failed: cases.length - passed,
    };
}