import {
  ContentState,
  EditorState,
  SelectionState,
} from "draft-js";

import { insertJsonSuggestion } from "./insertJsonSuggestion";
import { getJsonEditorInput } from "./getJsonEditorInput";
import type { JsonSuggestion } from "./jsonSuggestions";

type TestCase = {
  name: string;
  input: string;
  suggestion: JsonSuggestion;
  expected: string;
  shouldReject?: boolean;
};

function property(name: string): JsonSuggestion {
  return {
    kind: "property",
    id: `test-property:${name}`,
    label: name,
    description: "",
    priority: 0,
    propertyName: name,
  };
}

function value(
  item: string | number | boolean | null,
): JsonSuggestion {
  return {
    kind: "value",
    id: `test-value:${JSON.stringify(item)}`,
    label: String(item),
    description: "",
    priority: 0,
    value: item,
  };
}

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

function createState(input: string): EditorState {
  const { text, cursor } = extractCursor(input);
  const content = ContentState.createFromText(text);

  let remaining = cursor;

  for (const block of content.getBlocksAsArray()) {
    if (remaining <= block.getLength()) {
      const selection = SelectionState
        .createEmpty(block.getKey())
        .merge({
          anchorOffset: remaining,
          focusOffset: remaining,
          hasFocus: true,
        });

      return EditorState.forceSelection(
        EditorState.createWithContent(content),
        selection,
      );
    }

    remaining -= block.getLength() + 1;
  }

  throw new Error("Не удалось установить курсор");
}

function getMarkedText(state: EditorState): string {
  const input = getJsonEditorInput(state);

  if (!input) {
    throw new Error(
      "После вставки потерян фокус или выделение не свёрнуто",
    );
  }

  return (
    input.text.slice(0, input.cursor) +
    "│" +
    input.text.slice(input.cursor)
  );
}

const cases: TestCase[] = [
  {
    name: "Вставка нового свойства",
    input: "{ │ }",
    suggestion: property("method"),
    expected: '{ "method": │ }',
  },
  {
    name: "Замена частично введённого ключа",
    input: '{"me│"}',
    suggestion: property("method"),
    expected: '{"method": │}',
  },
  {
    name: "Существующее двоеточие не дублируется",
    input: '{"me│": "GET"}',
    suggestion: property("method"),
    expected: '{"method": │"GET"}',
  },
  {
    name: "Вставка строки в пустое значение",
    input: '{"method": │}',
    suggestion: value("GET"),
    expected: '{"method": "GET│"}',
  },
  {
    name: "Замена всего значения при курсоре в середине",
    input: '{"method": "PO│ST"}',
    suggestion: value("PUT"),
    expected: '{"method": "PUT│"}',
  },
  {
    name: "Соседнее свойство сохраняется",
    input: '{"method": "PO│ST", "timeout": 3000}',
    suggestion: value("GET"),
    expected: '{"method": "GET│", "timeout": 3000}',
  },
  {
    name: "Число вставляется без кавычек",
    input: '{"timeout": 10│00}',
    suggestion: value(3000),
    expected: '{"timeout": 3000│}',
  },
  {
    name: "Строка из цифр сохраняет строковый тип",
    input: '{"timeout": │}',
    suggestion: value("3000"),
    expected: '{"timeout": "3000│"}',
  },
  {
    name: "Boolean вставляется без кавычек",
    input: '{"enabled": fa│lse}',
    suggestion: value(true),
    expected: '{"enabled": true│}',
  },
  {
    name: "Null вставляется без кавычек",
    input: '{"result": │}',
    suggestion: value(null),
    expected: '{"result": null│}',
  },
  {
    name: "Кавычки внутри предложения экранируются",
    input: '{"description": "Sa│"}',
    suggestion: value('Say "hello"'),
    expected: String.raw`{"description": "Say \"hello\"│"}`,
  },
  {
    name: "Незакрытая строка в конце документа",
    input: '{"description": "Ret│',
    suggestion: value("Returns data."),
    expected: '{"description": "Returns data.│"',
  },
  {
    name: "Незакрытая строка не удаляет следующую строку",
    input: `{
  "description": "Ret│
  "method": "GET"
}`,
    suggestion: value("Returns data."),
    expected: `{
  "description": "Returns data.│"
  "method": "GET"
}`,
  },
  {
    name: "Отказ при неоднозначном окончании строки",
    input: '{"description": "Ret│ something',
    suggestion: value("Returns data."),
    expected: '{"description": "Ret│ something',
    shouldReject: true,
  },
  {
    name: "Кавычка соседнего ключа не поглощает текст",
    input: '{"description": "Ret│  "method": "GET"}',
    suggestion: value("Returns data."),
    expected: '{"description": "Ret│  "method": "GET"}',
    shouldReject: true,
  },
  {
    name: "Объект не заменяется строковым значением",
    input: '{"author": │{"name": "Alice"}}',
    suggestion: value("Alice"),
    expected: '{"author": │{"name": "Alice"}}',
    shouldReject: true,
  },
  {
    name: "Подсказка свойства не вставляется вместо значения",
    input: '{"method": "GE│"}',
    suggestion: property("description"),
    expected: '{"method": "GE│"}',
    shouldReject: true,
  },
  {
    name: "Копирование отступа соседнего свойства",
    input: `{
  "method": "GET",
│
}`,
    suggestion: property("path"),
    expected: `{
  "method": "GET",
  "path": │
}`,
  },
  {
    name: "Отступ вложенного объекта без соседних свойств",
    input: '{\n  "author": {\n│\n  }\n}',
    suggestion: property("name"),
    expected: '{\n  "author": {\n\t\t"name": │\n  }\n}',
  },
];

export function runJsonInsertionChecks() {
  let passed = 0;

  for (const test of cases) {
    try {
      const before = createState(test.input);

      const after = insertJsonSuggestion(
        before,
        test.suggestion,
      );

      const actual = getMarkedText(after);

      if (actual !== test.expected) {
        console.error(`✗ ${test.name}`, {
          expected: test.expected,
          actual,
        });

        continue;
      }

      if (test.shouldReject) {
        // Отказ не должен создавать новое состояние редактора.
        if (after !== before) {
          console.error(
            `✗ ${test.name}: текст сохранён, но состояние изменилось`,
          );

          continue;
        }
      } else {
        if (after === before) {
          console.error(`✗ ${test.name}: вставка не произошла`);
          continue;
        }

        // Проверяем восстановление текста после одной отмены.
        const undone = EditorState.undo(after);

        const originalText = before
          .getCurrentContent()
          .getPlainText("\n");

        const restoredText = undone
          .getCurrentContent()
          .getPlainText("\n");

        if (restoredText !== originalText) {
          console.error(`✗ ${test.name}: ошибка отмены`, {
            expected: originalText,
            actual: restoredText,
          });

          continue;
        }

        // Проверяем повтор изменения.
        const redone = EditorState.redo(undone);

        const reappliedText = redone
          .getCurrentContent()
          .getPlainText("\n");

        const insertedText = after
          .getCurrentContent()
          .getPlainText("\n");

        if (reappliedText !== insertedText) {
          console.error(`✗ ${test.name}: ошибка повтора изменения`);
          continue;
        }
      }

      passed++;
      console.log(`✓ ${test.name}`);
    } catch (error) {
      console.error(`✗ ${test.name}: исключение`, error);
    }
  }

  console.log(`Вставка: пройдено ${passed}/${cases.length}`);

  return {
    passed,
    failed: cases.length - passed,
  };
}