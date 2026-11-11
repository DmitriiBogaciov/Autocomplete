import type { JsonContext, JsonPath } from "./getJsonContext";
import type { JsonSuggestion } from "./jsonSuggestions";
import type { JsonDocumentAnalysis } from "./analyzeJsonDocument";

export type DocumentSuggestions = {
  existingNames: string[];
  siblingNames: string[];
  valueSuggestions: JsonSuggestion[];
};

function haveSimilarPaths(
  first: JsonPath,
  second: JsonPath,
): boolean {
  if (first.length !== second.length) {
    return false;
  }

  let hasDifferentArrayIndex = false;

  for (let i = 0; i < first.length; i++) {
    const a = first[i];
    const b = second[i];

    if (typeof a === "number" && typeof b === "number") {
      if (a !== b) {
        hasDifferentArrayIndex = true;
      }

      continue;
    }

    if (a !== b) {
      return false;
    }
  }

  return hasDifferentArrayIndex;
}

export function getDocumentSuggestions(
  analysis: JsonDocumentAnalysis,
  context: JsonContext,
  cursor: number,
): DocumentSuggestions {
  const result: DocumentSuggestions = {
    existingNames: [],
    siblingNames: [],
    valueSuggestions: [],
  };

  if (context.kind === "none") {
    return result;
  }

  if (context.kind === "property") {
    const currentObject = analysis.objects
      .filter(
        (object) =>
          object.start < cursor &&
          cursor <= object.end,
      )
      .reduce<(typeof analysis.objects)[number] | undefined>(
        (current, object) =>
          !current || object.start > current.start
            ? object
            : current,
        undefined,
      );

    if (!currentObject) {
      return result;
    }

    result.existingNames = [
      ...new Set(
        currentObject.properties
          .filter(
            (property) =>
              !(
                property.start <= cursor &&
                cursor < property.end
              ),
          )
          .map((property) => property.name),
      ),
    ];

    result.siblingNames = [
      ...new Set(
        analysis.objects
          .filter(
            (object) =>
              object !== currentObject &&
              haveSimilarPaths(object.path, currentObject.path),
          )
          .flatMap((object) =>
            object.properties.map((property) => property.name),
          ),
      ),
    ];

    return result;
  }

  const unique = new Map<string, JsonSuggestion>();

  for (const entry of analysis.values) {
    if (entry.start <= cursor && cursor <= entry.end) {
      continue;
    }

    if (!haveSimilarPaths(entry.path, context.path)) {
      continue;
    }

    const identity = JSON.stringify(entry.value);

    unique.set(identity, {
      kind: "value",
      id: `document-value:${identity}`,
      label:
        typeof entry.value === "string"
          ? entry.value
          : identity,
      description:
        "Previously used at a similar location in this document.",
      priority: -1,
      value: entry.value,
    });
  }

  result.valueSuggestions = [...unique.values()];

  return result;
}