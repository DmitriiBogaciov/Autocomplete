import type { JsonPath } from "./getJsonContext";

export type JsonScalar = string | number | boolean | null;

export type PropertyEntry = {
  name: string;
  start: number;
  end: number;
};

export type ObjectScope = {
  start: number;
  end: number;
  path: JsonPath;
  properties: PropertyEntry[];
};

export type ValueEntry = {
  path: JsonPath;
  value: JsonScalar;
  start: number;
  end: number;
};

export type JsonDocumentAnalysis = {
  objects: ObjectScope[];
  values: ValueEntry[];
};

type Frame =
  | {
      kind: "object";
      scope: ObjectScope;
      currentKey: string | null;
    }
  | {
      kind: "array";
      path: JsonPath;
      index: number;
    };

export function analyzeJsonDocument(
  text: string,
): JsonDocumentAnalysis {
  const objects: ObjectScope[] = [];
  const values: ValueEntry[] = [];
  const stack: Frame[] = [];

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

    return [...parent.scope.path, parent.currentKey];
  }

  function rememberValue(
    value: JsonScalar,
    start: number,
    end: number,
  ) {
    const path = getValuePath();

    if (path !== null) {
      values.push({ path, value, start, end });
    }
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
        parent.currentKey = decoded;

        parent.scope.properties.push({
          name: decoded,
          start,
          end: i,
        });
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
        const scope: ObjectScope = {
          start: i,
          end: text.length,
          path,
          properties: [],
        };

        objects.push(scope);

        stack.push({
          kind: "object",
          scope,
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
        return { objects: [], values: [] };
      }

      if (parent.kind === "object") {
        parent.scope.end = i;
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

    const start = i;

    while (
      i < text.length &&
      !/[\x20\t\r\n,}\]]/.test(text[i])
    ) {
      i++;
    }

    try {
      const value: unknown = JSON.parse(text.slice(start, i));

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
      break;
    }
  }

  return { objects, values };
}