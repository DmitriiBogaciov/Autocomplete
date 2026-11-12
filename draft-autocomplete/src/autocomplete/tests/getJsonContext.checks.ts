import { getJsonContext } from "../getJsonContext";
import type { JsonContext } from "../getJsonContext";

type TestCase = {
  name: string;
  input: string;
  expected: JsonContext;
};

// Символ │ обозначает курсор и удаляется перед проверкой.
function extractCursor(input: string) {
  const cursor = input.indexOf("│");

  if (cursor === -1 || input.indexOf("│", cursor + 1) !== -1) {
    throw new Error("В примере должен быть ровно один символ │");
  }

  return {
    text: input.slice(0, cursor) + input.slice(cursor + 1),
    cursor,
  };
}

function contextsEqual(
  actual: JsonContext,
  expected: JsonContext,
): boolean {
  if (actual.kind !== expected.kind) {
    return false;
  }

  if (actual.kind === "none" || expected.kind === "none") {
    return actual.kind === expected.kind;
  }

  return (
    actual.query === expected.query &&
    actual.insideString === expected.insideString &&
    actual.path.length === expected.path.length &&
    actual.path.every(
      (part, index) => part === expected.path[index],
    )
  );
}

const cases: TestCase[] = [
  {
    name: "Свойство в пустом объекте",
    input: "{ │ }",
    expected: {
      kind: "property",
      path: [],
      query: "",
      insideString: false,
    },
  },
  {
    name: "Ввод имени свойства",
    input: '{"met│"}',
    expected: {
      kind: "property",
      path: [],
      query: "met",
      insideString: true,
    },
  },
  {
    name: "Значение после двоеточия",
    input: '{"method": │}',
    expected: {
      kind: "value",
      path: ["method"],
      query: "",
      insideString: false,
    },
  },
  {
    name: "Ввод строкового значения",
    input: '{"method": "GE│"}',
    expected: {
      kind: "value",
      path: ["method"],
      query: "GE",
      insideString: true,
    },
  },
  {
    name: "Курсор в середине значения",
    input: '{"method": "PO│ST"}',
    expected: {
      kind: "value",
      path: ["method"],
      query: "PO",
      insideString: true,
    },
  },
  {
    name: "После закрывающей кавычки значения",
    input: '{"method": "GET"│}',
    expected: {
      kind: "none",
    },
  },
  {
    name: "Свойство вложенного объекта",
    input: '{"author": {"na│"}}',
    expected: {
      kind: "property",
      path: ["author"],
      query: "na",
      insideString: true,
    },
  },
  {
    name: "Значение во втором объекте массива",
    input: '[{"name": "Alice"}, {"name": "Al│"}]',
    expected: {
      kind: "value",
      path: [1, "name"],
      query: "Al",
      insideString: true,
    },
  },
  {
    name: "Второй элемент массива значений",
    input: '{"errors": ["First", "Sec│"]}',
    expected: {
      kind: "value",
      path: ["errors", 1],
      query: "Sec",
      insideString: true,
    },
  },
  {
    name: "Скобки и запятая внутри строки не меняют структуру",
    input: '{"description": "Example: {x}, [y]", "me│"}',
    expected: {
      kind: "property",
      path: [],
      query: "me",
      insideString: true,
    },
  },
  {
    name: "Экранированные кавычки внутри значения",
    input: String.raw`{"description": "Say \"hello\"│"}`,
    expected: {
      kind: "value",
      path: ["description"],
      query: 'Say "hello"',
      insideString: true,
    },
  },
  {
    name: "Незакрытая строка",
    input: '{"description": "Ret│',
    expected: {
      kind: "value",
      path: ["description"],
      query: "Ret",
      insideString: true,
    },
  },
  {
    name: "Незавершённое Unicode-экранирование",
    input: String.raw`{"description": "\u00│`,
    expected: {
      kind: "none",
    },
  },
  {
    name: "Ввод числа",
    input: '{"timeout": 30│}',
    expected: {
      kind: "value",
      path: ["timeout"],
      query: "30",
      insideString: false,
    },
  },
  {
    name: "Ввод boolean",
    input: '{"enabled": tr│}',
    expected: {
      kind: "value",
      path: ["enabled"],
      query: "tr",
      insideString: false,
    },
  },
  {
    name: "Восстановление после запятой в объекте",
    input: '[{"name": "Alice",}, {"method": "│"}]',
    expected: {
      kind: "value",
      path: [1, "method"],
      query: "",
      insideString: true,
    },
  },
  {
    name: "Восстановление после запятой в массиве",
    input: '{"errors": ["Example",], "method": "│"}',
    expected: {
      kind: "value",
      path: ["method"],
      query: "",
      insideString: true,
    },
  },
  {
    name: "Отсутствующее значение не считается завершённым",
    input: '[{"name": }, {"method": "│"}]',
    expected: {
      kind: "none",
    },
  },
  {
    name: "Двойная запятая",
    input: '{"method": "GET",, "pa│"}',
    expected: {
      kind: "none",
    },
  },
  {
    name: "Перепутанные закрывающие скобки",
    input: '{"errors": [} │',
    expected: {
      kind: "none",
    },
  },
];

export function runJsonContextChecks() {
  let passed = 0;

  for (const test of cases) {
    const { text, cursor } = extractCursor(test.input);

    try {
      const actual = getJsonContext(text, cursor);

      if (contextsEqual(actual, test.expected)) {
        passed++;
        console.log(`✓ ${test.name}`);
      } else {
        console.error(`✗ ${test.name}`, {
          input: test.input,
          expected: test.expected,
          actual,
        });
      }
    } catch (error) {
      console.error(`✗ ${test.name}: исключение`, error);
    }
  }

  console.log(`Пройдено: ${passed}/${cases.length}`);

  return {
    passed,
    failed: cases.length - passed,
  };
}