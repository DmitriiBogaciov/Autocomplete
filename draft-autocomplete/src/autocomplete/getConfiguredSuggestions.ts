import type { JsonContext, JsonPath } from "./getJsonContext";
import type { AutocompleteConfig } from "./autocompleteConfig";
import type { DocumentSuggestions } from "./getDocumentSuggestions";

import {
  getJsonSuggestions,
} from "./jsonSuggestions";

import type {
  JsonSuggestion,
  RuleEnvironment,
} from "./jsonSuggestions";

function matchesPath(
  pattern: Array<string | null>,
  actual: JsonPath,
): boolean {
  return (
    pattern.length === actual.length &&
    pattern.every((part, index) =>
      part === null
        ? typeof actual[index] === "number"
        : part === actual[index]
    )
  );
}

function normalize(text: string): string {
  return text.normalize("NFC").trim().toLowerCase();
}

export function getConfiguredSuggestions(
  context: JsonContext,
  config: AutocompleteConfig,
  fromDocument: DocumentSuggestions,
  environment: RuleEnvironment,
): JsonSuggestion[] {
  const candidates = getJsonSuggestions(
    context,
    config.groups.flatMap((group) => group.rules),
    fromDocument.existingNames,
    fromDocument.siblingNames,
    fromDocument.valueSuggestions,
    environment,
  );

  // Групповое повышение пока применяется только к свойствам.
  if (context.kind !== "property") {
    return candidates;
  }

  const currentObject = environment.analysis.objects.find(
    (object) =>
      object.start < environment.cursor &&
      environment.cursor <= object.end &&
      object.path.length === context.path.length &&
      object.path.every(
        (part, index) => part === context.path[index],
      ),
  );

  if (!currentObject) {
    return candidates;
  }

  const presentProperties = new Set(
    currentObject.properties.map((property) => property.name),
  );

  const boosts = new Map<string, number>();

  const factor =
    Number.isFinite(config.groupBoostFactor)
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

        // Повторное описание одного свойства не умножает вес.
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
      // Для общего свойства берём максимум, а не сумму групп.
      boosts.set(
        name,
        Math.max(boosts.get(name) ?? 0, groupBoost),
      );
    }
  }

  function score(suggestion: JsonSuggestion): number {
    return (
      suggestion.priority +
      (
        suggestion.kind === "property"
          ? boosts.get(suggestion.propertyName) ?? 0
          : 0
      )
    );
  }

  const query = normalize(context.query);

  return [...candidates].sort((a, b) => {
    const aStarts = normalize(a.label).startsWith(query);
    const bStarts = normalize(b.label).startsWith(query);

    if (aStarts !== bStarts) {
      return aStarts ? -1 : 1;
    }

    return (
      score(b) - score(a) ||
      a.label.localeCompare(b.label, "en")
    );
  });
}