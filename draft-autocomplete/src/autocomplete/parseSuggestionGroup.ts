import type {
  JsonSuggestion,
  JsonSuggestionRule,
} from "./jsonSuggestions";

export type SuggestionGroup = {
  id: string;
  label: string;
  rules: JsonSuggestionRule[];
};

type Scalar = string | number | boolean | null;

function asObject(
  value: unknown,
  location: string,
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(`${location}: ожидается объект`);
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown, location: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${location}: ожидается массив`);
  }

  return value;
}

function asString(value: unknown, location: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${location}: ожидается непустая строка`);
  }

  return value;
}

function optionalDescription(
  value: unknown,
  location: string,
): string {
  if (value === undefined) {
    return "";
  }

  if (typeof value !== "string") {
    throw new Error(`${location}: ожидается строка`);
  }

  return value;
}

function asNumber(
  value: unknown,
  location: string,
  fallback = 0,
): number {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${location}: ожидается конечное число`);
  }

  return value;
}

function asScalar(value: unknown, location: string): Scalar {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }

  throw new Error(
    `${location}: ожидается строка, число, boolean или null`,
  );
}

export function parseSuggestionGroup(
  input: unknown,
): SuggestionGroup {
  const root = asObject(input, "group");

  const id = asString(root.id, "id");

  const label = root.label === undefined
    ? id
    : asString(root.label, "label");

  const paths = asArray(root.objectPaths, "objectPaths").map(
    (rawPath, pathIndex): Array<string | null> =>
      asArray(rawPath, `objectPaths[${pathIndex}]`).map(
        (part, index) =>
          part === null
            ? null
            : asString(
                part,
                `objectPaths[${pathIndex}][${index}]`,
              ),
      ),
  );

  if (paths.length === 0) {
    throw new Error("objectPaths: укажи хотя бы один путь");
  }

  const propertyNames = new Set<string>();
  const rules: JsonSuggestionRule[] = [];

  const rawProperties = asArray(root.properties, "properties");

  for (const [propertyIndex, rawProperty] of rawProperties.entries()) {
    const location = `properties[${propertyIndex}]`;
    const field = asObject(rawProperty, location);

    const name = asString(field.name, `${location}.name`);

    if (propertyNames.has(name)) {
      throw new Error(`${location}: свойство "${name}" повторяется`);
    }

    propertyNames.add(name);

    const description = optionalDescription(
      field.description,
      `${location}.description`,
    );

    const priority = asNumber(
      field.priority,
      `${location}.priority`,
    );

    const contextWeight = asNumber(
      field.contextWeight,
      `${location}.contextWeight`,
    );

    if (contextWeight < 0) {
      throw new Error(`${location}.contextWeight: вес не может быть отрицательным`);
    }

    if (
      field.arrayItems !== undefined &&
      typeof field.arrayItems !== "boolean"
    ) {
      throw new Error(`${location}.arrayItems: ожидается boolean`);
    }

    const arrayItems = field.arrayItems === true;

    const propertySuggestion: JsonSuggestion = {
      kind: "property",
      id: `${id}:property:${name}`,
      label: name,
      description,
      priority,
      propertyName: name,
      contextWeight,
    };

    for (const path of paths) {
      rules.push({
        kind: "property",
        path,
        suggestions: [propertySuggestion],
      });
    }

    const rawValues = field.values === undefined
      ? []
      : asArray(field.values, `${location}.values`);

    for (const [valueIndex, rawValue] of rawValues.entries()) {
      const valueLocation = `${location}.values[${valueIndex}]`;
      const entry = asObject(rawValue, valueLocation);

      const value = asScalar(entry.value, `${valueLocation}.value`);

      const valuePriority = asNumber(
        entry.priority,
        `${valueLocation}.priority`,
      );

      const valueDescription = optionalDescription(
        entry.description,
        `${valueLocation}.description`,
      );

      const when = entry.when === undefined
        ? undefined
        : asArray(entry.when, `${valueLocation}.when`).map(
            (rawCondition, conditionIndex) => {
              const conditionLocation =
                `${valueLocation}.when[${conditionIndex}]`;

              const condition = asObject(
                rawCondition,
                conditionLocation,
              );

              return {
                property: asString(
                  condition.property,
                  `${conditionLocation}.property`,
                ),
                equals: asScalar(
                  condition.equals,
                  `${conditionLocation}.equals`,
                ),
              };
            },
          );

      // Наша текущая проверка условий работает с соседями
      // значения свойства, а не с элементами массива.
      if (arrayItems && when && when.length > 0) {
        throw new Error(
          `${valueLocation}: when для элементов массива пока не поддерживается`,
        );
      }

      const suggestion: JsonSuggestion = {
        kind: "value",
        id: `${id}:value:${name}:${valueIndex}`,
        label: typeof value === "string"
          ? value
          : JSON.stringify(value),
        description: valueDescription,
        priority: valuePriority,
        value,
      };

      for (const path of paths) {
        rules.push({
          kind: "value",
          path: [
            ...path,
            name,
            ...(arrayItems ? [null] : []),
          ],
          when,
          suggestions: [suggestion],
        });
      }
    }
  }

  return { id, label, rules };
}