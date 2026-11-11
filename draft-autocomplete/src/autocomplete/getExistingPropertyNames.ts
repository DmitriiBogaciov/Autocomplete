import type { JsonPath } from "./getJsonContext";

type PropertyEntry = {
  name: string;
  start: number;
  end: number;
};

type ObjectScope = {
  start: number;
  end: number;
  path: JsonPath;
  properties: PropertyEntry[];
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

export type DocumentPropertyInfo = {
  existingNames: string[];
  siblingNames: string[];
};

export function haveSimilarPaths(
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

export function getDocumentPropertyInfo(
  text: string,
  cursor: number,
): DocumentPropertyInfo {
  const empty: DocumentPropertyInfo = {
    existingNames: [],
    siblingNames: [],
  };

  if (
    !Number.isInteger(cursor) ||
    cursor < 0 ||
    cursor > text.length
  ) {
    return empty;
  }

  const objects: ObjectScope[] = [];
  const stack: Frame[] = [];

  let i = 0;

  // Путь значения, которое находится внутри текущей структуры.
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

  while (i < text.length) {
    const char = text[i];

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

      const end = i;
      let next = end;

      while (
        next < text.length &&
        /[\x20\t\r\n]/.test(text[next])
      ) {
        next++;
      }

      const frame = stack[stack.length - 1];

      if (
        frame?.kind === "object" &&
        text[next] === ":"
      ) {
        try {
          const name: string = JSON.parse(
            text.slice(start, end),
          );

          frame.currentKey = name;

          frame.scope.properties.push({
            name,
            start,
            end,
          });
        } catch {
          // Не связываем следующие данные с предыдущим ключом.
          frame.currentKey = null;
        }
      }

      continue;
    }

    if (char === "{") {
      const path = getValuePath();

      if (path === null) {
        return empty;
      }

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

      i++;
      continue;
    }

    if (char === "[") {
      const path = getValuePath();

      if (path === null) {
        return empty;
      }

      stack.push({
        kind: "array",
        path,
        index: 0,
      });

      i++;
      continue;
    }

    if (char === ",") {
      const frame = stack[stack.length - 1];

      if (frame?.kind === "array") {
        frame.index++;
      } else if (frame?.kind === "object") {
        frame.currentKey = null;
      }

      i++;
      continue;
    }

    if (char === "}") {
      const frame = stack.pop();

      if (!frame || frame.kind !== "object") {
        return empty;
      }

      frame.scope.end = i;
      i++;
      continue;
    }

    if (char === "]") {
      const frame = stack.pop();

      if (!frame || frame.kind !== "array") {
        return empty;
      }

      i++;
      continue;
    }

    i++;
  }

  let currentObject: ObjectScope | undefined;

  for (const object of objects) {
    if (
      object.start < cursor &&
      cursor <= object.end &&
      (!currentObject || object.start > currentObject.start)
    ) {
      currentObject = object;
    }
  }

  if (!currentObject) {
    return empty;
  }

  const existingNames = currentObject.properties
    .filter((property) => {
      const isBeingEdited =
        property.start <= cursor &&
        cursor < property.end;

      return !isBeingEdited;
    })
    .map((property) => property.name);

  const siblingNames: string[] = [];

  for (const object of objects) {
    if (
      object !== currentObject &&
      haveSimilarPaths(object.path, currentObject.path)
    ) {
      for (const property of object.properties) {
        siblingNames.push(property.name);
      }
    }
  }

  return {
    existingNames: [...new Set(existingNames)],
    siblingNames: [...new Set(siblingNames)],
  };
}