import type { JsonPath } from "./getJsonContext";
import type { JsonSuggestion } from "./jsonSuggestions";
import { haveSimilarPaths } from "./getExistingPropertyNames";

type JsonScalar = string | number | boolean | null;

type Frame =
  | {
      kind: "object";
      path: JsonPath;
      currentKey: string | null;
    }
  | {
      kind: "array";
      path: JsonPath;
      index: number;
    };

export function getDocumentValueSuggestions(
  text: string,
  cursor: number,
  targetPath: JsonPath,
): JsonSuggestion[] {
  const stack: Frame[] = [];

  const suggestions = new Map<string, JsonSuggestion>();

  let i = 0;

  function getValuePath(): JsonPath | null {
    const parent = stack[stack.length - 1];

    if (!parent) {
      return [];
    }

    if (parent.kind === "array") {
      return [...parent.path, parent.index];
    }

    if (parent.currentKey === null) {
      return null;
    }

    return [...parent.path, parent.currentKey];
  }

  function rememberValue(
    value: JsonScalar,
    start: number,
    end: number,
  ) {
    // Текущее редактируемое значение не является подсказкой
    // само для себя.
    if (start <= cursor && cursor <= end) {
      return;
    }

    const path = getValuePath();

    if (!path || !haveSimilarPaths(path, targetPath)) {
      return;
    }

    // Сериализация сохраняет различие между 3000 и "3000".
    const identity = JSON.stringify(value);

    suggestions.set(identity, {
      kind: "value",
      id: `document-value:${identity}`,
      label: typeof value === "string" ? value : identity,
      description:
        "Previously used at a similar location in this document.",
      priority: -1,
      value,
    });
  }

  while (i < text.length) {
    const char = text[i];

    if (/[\x20\t\r\n]/.test(char)) {
      i++;
      continue;
    }

    if (char === '"') {
      const start = i;
      i++;

      let closed = false;

      while (i < text.length) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }

        if (text[i] === '"') {
          i++;
          closed = true;
          break;
        }

        i++;
      }

      if (!closed) {
        break;
      }

      let decoded: string;

      try {
        decoded = JSON.parse(text.slice(start, i));
      } catch {
        break;
      }

      let next = i;

      while (
        next < text.length &&
        /[\x20\t\r\n]/.test(text[next])
      ) {
        next++;
      }

      const parent = stack[stack.length - 1];

      if (
        parent?.kind === "object" &&
        text[next] === ":"
      ) {
        // Это имя свойства, а не значение.
        parent.currentKey = decoded;
      } else {
        rememberValue(decoded, start, i);
      }

      continue;
    }

    if (char === "{" || char === "[") {
      const path = getValuePath();

      if (path === null) {
        break;
      }

      if (char === "{") {
        stack.push({
          kind: "object",
          path,
          currentKey: null,
        });
      } else {
        stack.push({
          kind: "array",
          path,
          index: 0,
        });
      }

      i++;
      continue;
    }

    if (char === "}" || char === "]") {
      const parent = stack.pop();

      const expectedKind =
        char === "}" ? "object" : "array";

      if (!parent || parent.kind !== expectedKind) {
        return [];
      }

      i++;
      continue;
    }

    if (char === ",") {
      const parent = stack[stack.length - 1];

      if (parent?.kind === "array") {
        parent.index++;
      } else if (parent?.kind === "object") {
        parent.currentKey = null;
      }

      i++;
      continue;
    }

    if (char === ":") {
      i++;
      continue;
    }

    // Нестроковое значение: число, boolean или null.
    const start = i;

    while (
      i < text.length &&
      !/[\x20\t\r\n,}\]]/.test(text[i])
    ) {
      i++;
    }

    const token = text.slice(start, i);

    try {
      const value: unknown = JSON.parse(token);

      if (
        value === null ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
      ) {
        rememberValue(value, start, i);
      } else {
        break;
      }
    } catch {
      // Незавершённое или некорректное значение.
      break;
    }
  }

  return [...suggestions.values()];
}