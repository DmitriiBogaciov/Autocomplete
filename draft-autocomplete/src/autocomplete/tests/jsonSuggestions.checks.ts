import { getJsonContext } from "../getJsonContext";
import { analyzeJsonDocument } from "../analyzeJsonDocument";
import { getDocumentSuggestions } from "../getDocumentSuggestions";
import { getJsonSuggestions } from "../suggestions";

import type {
  JsonSuggestion,
  JsonSuggestionRule,
} from "../suggestions";

type Scalar = string | number | boolean | null;

function property(
  name: string,
  priority = 0,
): JsonSuggestion {
  return {
    kind: "property",
    id: `configured-property:${name}`,
    label: name,
    description: "",
    priority,
    propertyName: name,
  };
}

function value(
  item: Scalar,
  priority = 0,
): JsonSuggestion {
  return {
    kind: "value",
    id: `configured-value:${JSON.stringify(item)}`,
    label: typeof item === "string" ? item : JSON.stringify(item),
    description: "",
    priority,
    value: item,
  };
}

// Идентификаторы для сравнения результатов.
// Число 3000 и строка "3000" здесь различаются.
function p(name: string): string {
  return `property:${name}`;
}

function v(item: Scalar): string {
  return `value:${JSON.stringify(item)}`;
}

function identify(suggestion: JsonSuggestion): string {
  return suggestion.kind === "property"
    ? p(suggestion.propertyName)
    : v(suggestion.value);
}

const rootRules: JsonSuggestionRule[] = [
  {
    kind: "property",
    path: [],
    suggestions: [
      property("method"),
      property("description"),
      property("timeout"),
    ],
  },
  {
    kind: "value",
    path: ["method"],
    suggestions: [
      value("GET", 10),
      value("POST", 5),
    ],
  },
  {
    kind: "value",
    path: ["description"],
    when: [{ property: "method", equals: "GET" }],
    suggestions: [value("Returns data.", 10)],
  },
  {
    kind: "value",
    path: ["description"],
    when: [{ property: "method", equals: "POST" }],
    suggestions: [value("Creates a resource.", 10)],
  },
];

const configuredRules: JsonSuggestionRule[] = [
  ...rootRules,
  ...rootRules.map(
    (rule): JsonSuggestionRule => ({
      ...rule,
      path: [null, ...rule.path],
    }),
  ),
];

type TestCase = {
  name: string;
  input: string;
  expected: string[];
  rules?: JsonSuggestionRule[];
  checkOrder?: boolean;
};

const cases: TestCase[] = [
  {
    name: "Пустой запрос показывает все настроенные свойства",
    input: "{ │ }",
    rules: configuredRules,
    expected: [
      p("method"),
      p("description"),
      p("timeout"),
    ],
  },
  {
    name: "Уже существующее свойство исключается",
    input: '{"method": "GET", "│"}',
    rules: configuredRules,
    expected: [
      p("description"),
      p("timeout"),
    ],
  },
  {
    name: "Свойство справа от курсора тоже исключается",
    input: '{"│", "method": "GET"}',
    rules: configuredRules,
    expected: [
      p("description"),
      p("timeout"),
    ],
  },
  {
    name: "Редактируемое имя остаётся среди подсказок",
    input: '{"met│hod": "GET"}',
    rules: configuredRules,
    expected: [p("method")],
  },
  {
    name: "Неизвестное конфигурации свойство берётся из соседа",
    input: '[{"timeout": 3000}, {"ti│"}]',
    expected: [p("timeout")],
  },
  {
    name: "Свойства вложенного объекта не поднимаются наружу",
    input: '[{"author": {"name": "Alice"}}, {│}]',
    expected: [p("author")],
  },
  {
    name: "Свойства соответствующих вложенных объектов используются",
    input:
      '[{"author": {"name": "Alice"}}, {"author": {"na│"}}]',
    expected: [p("name")],
  },
  {
    name: "Разные вложенные пути не смешиваются",
    input:
      '[{"company": {"name": "Acme"}}, {"author": {"na│"}}]',
    expected: [],
  },
  {
    name: "Свойство из конфигурации и документа не дублируется",
    input: '[{"timeout": 3000}, {"time│"}]',
    rules: configuredRules,
    expected: [p("timeout")],
  },
  {
    name: "Повторное значение из нескольких объектов объединяется",
    input:
      '[{"name": "Alice"}, {"name": "Alice"}, {"name": "│"}]',
    expected: [v("Alice")],
  },
  {
    name: "Вложенное значение предлагается по соответствующему пути",
    input:
      '[{"author": {"name": "Alice"}}, {"author": {"name": "│"}}]',
    expected: [v("Alice")],
  },
  {
    name: "Значения разных свойств не смешиваются",
    input: '[{"city": "Prague"}, {"name": "│"}]',
    expected: [],
  },
  {
    name: "Строка и число остаются разными значениями",
    input:
      '[{"timeout": 3000}, {"timeout": "3000"}, {"timeout": │}]',
    expected: [v(3000), v("3000")],
  },
  {
    name: "Boolean и null сохраняют тип",
    input:
      '[{"result": true}, {"result": null}, {"result": │}]',
    expected: [v(true), v(null)],
  },
  {
    name: "Текущее значение не предлагает само себя",
    input: '[{"name": "Al│ice"}]',
    expected: [],
  },
  {
    name: "Поиск значения работает по вхождению",
    input:
      '[{"error": "Missing access token"}, {"error": "token│"}]',
    expected: [v("Missing access token")],
  },
  {
    name: "Условие GET выбирает описание получения",
    input: '{"method": "GET", "description": "│"}',
    rules: configuredRules,
    expected: [v("Returns data.")],
  },
  {
    name: "Условие POST выбирает описание создания",
    input: '{"method": "POST", "description": "│"}',
    rules: configuredRules,
    expected: [v("Creates a resource.")],
  },
  {
    name: "Условие учитывает свойство справа от курсора",
    input: '{"description": "│", "method": "GET"}',
    rules: configuredRules,
    expected: [v("Returns data.")],
  },
  {
    name: "Метод соседнего объекта не влияет на условие",
    input:
      '[{"method": "POST"}, {"method": "GET", "description": "│"}]',
    rules: configuredRules,
    expected: [v("Returns data.")],
  },
  {
    name: "Без method условные предложения не появляются",
    input: '{"description": "│"}',
    rules: configuredRules,
    expected: [],
  },
  {
    name: "При повторяющемся method условие не угадывается",
    input:
      '{"method": "GET", "method": "POST", "description": "│"}',
    rules: configuredRules,
    expected: [],
  },
  {
    name: "Одинаковое значение из конфигурации и документа объединяется",
    input: '[{"method": "GET"}, {"method": "│"}]',
    rules: configuredRules,
    expected: [v("GET"), v("POST")],
  },
  {
    name: "При пустом запросе учитывается приоритет",
    input: '{"method": "│"}',
    rules: configuredRules,
    expected: [v("GET"), v("POST")],
    checkOrder: true,
  },
  {
    name: "Совпадение по началу выше совпадения внутри слова",
    input: '{"error": "token│"}',
    rules: [
      {
        kind: "value",
        path: ["error"],
        suggestions: [
          value("Missing token", 100),
          value("Token expired", 1),
        ],
      },
    ],
    expected: [
      v("Token expired"),
      v("Missing token"),
    ],
    checkOrder: true,
  },
  {
    name: "При отсутствии контекста список пуст",
    input: '{"method": "GET"│}',
    rules: configuredRules,
    expected: [],
  },
];

function extractCursor(input: string) {
  const cursor = input.indexOf("│");

  if (cursor === -1 || input.indexOf("│", cursor + 1) !== -1) {
    throw new Error("Нужен ровно один символ │");
  }

  return {
    text: input.slice(0, cursor) + input.slice(cursor + 1),
    cursor,
  };
}

export function runJsonSuggestionsChecks() {
  let passed = 0;

  for (const test of cases) {
    try {
      const { text, cursor } = extractCursor(test.input);

      const context = getJsonContext(text, cursor);
      const analysis = analyzeJsonDocument(text);

      const fromDocument = getDocumentSuggestions(
        analysis,
        context,
        cursor,
      );

      const suggestions = getJsonSuggestions(
        context,
        test.rules ?? [],
        fromDocument.existingNames,
        fromDocument.siblingNames,
        fromDocument.valueSuggestions,
        { analysis, cursor },
      );

      const actual = suggestions.map(identify);

      // Проверяем уникальность отдельно, чтобы сравнение
      // наборов не скрыло повторные предложения.
      if (new Set(actual).size !== actual.length) {
        console.error(`✗ ${test.name}: есть дубликаты`, actual);
        continue;
      }

      const actualForComparison = test.checkOrder
        ? actual
        : [...actual].sort();

      const expectedForComparison = test.checkOrder
        ? test.expected
        : [...test.expected].sort();

      const matches =
        actualForComparison.length ===
          expectedForComparison.length &&
        actualForComparison.every(
          (item, index) => item === expectedForComparison[index],
        );

      if (!matches) {
        console.error(`✗ ${test.name}`, {
          input: test.input,
          context,
          expected: test.expected,
          actual,
        });

        continue;
      }

      passed++;
      console.log(`✓ ${test.name}`);
    } catch (error) {
      console.error(`✗ ${test.name}: исключение`, error);
    }
  }

  console.log(`Подсказки: пройдено ${passed}/${cases.length}`);

  return {
    passed,
    failed: cases.length - passed,
  };
}