type PropertyEntry = {
  name: string;
  start: number;
  end: number;
};

type ObjectScope = {
  start: number;
  end: number;
  properties: PropertyEntry[];
};

type Frame =
  | {
      kind: "object";
      scope: ObjectScope;
    }
  | {
      kind: "array";
    };

export function getExistingPropertyNames(
  text: string,
  cursor: number,
): string[] {
  if (
    !Number.isInteger(cursor) ||
    cursor < 0 ||
    cursor > text.length
  ) {
    return [];
  }

  const objects: ObjectScope[] = [];
  const stack: Frame[] = [];

  let i = 0;

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

      // Не пытаемся угадывать структуру за незакрытой строкой.
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

      // Строка перед двоеточием внутри объекта — имя свойства.
      if (
        frame?.kind === "object" &&
        text[next] === ":"
      ) {
        try {
          const name: string = JSON.parse(
            text.slice(start, end),
          );

          frame.scope.properties.push({
            name,
            start,
            end,
          });
        } catch {
        }
      }

      continue;
    }

    if (char === "{") {
      const scope: ObjectScope = {
        start: i,
        end: text.length,
        properties: [],
      };

      objects.push(scope);
      stack.push({ kind: "object", scope });

      i++;
      continue;
    }

    if (char === "[") {
      stack.push({ kind: "array" });
      i++;
      continue;
    }

    if (char === "}") {
      const frame = stack.pop();

      if (!frame || frame.kind !== "object") {
        return [];
      }

      frame.scope.end = i;
      i++;
      continue;
    }

    if (char === "]") {
      const frame = stack.pop();

      if (!frame || frame.kind !== "array") {
        return [];
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
    return [];
  }

  const names = currentObject.properties
    .filter((property) => {
      const isBeingEdited =
        property.start <= cursor &&
        cursor < property.end;

      return !isBeingEdited;
    })
    .map((property) => property.name);

  return [...new Set(names)];
}