import {
  EditorState,
  Modifier,
  SelectionState,
} from "draft-js";

import type { ContentState } from "draft-js";
import type { JsonSuggestion } from "./jsonSuggestions";

import { getJsonEditorInput } from "./getJsonEditorInput";
import { getJsonContext } from "./getJsonContext";

type TextRange = {
  start: number;
  end: number;
};

// Находим конец строки JSON с учётом экранированных кавычек.
function findStringEnd(text: string, start: number): number {
  let i = start + 1;

  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }

    if (text[i] === '"') {
      return i + 1;
    }

    // Незавершённую строку не растягиваем на следующие строки.
    if (text[i] === "\n" || text[i] === "\r") {
      return i;
    }

    i++;
  }

  return text.length;
}

function findTokenRange(
  text: string,
  cursor: number,
  insideString: boolean,
  query: string,
): TextRange | null {
  if (insideString) {
    let i = 0;

    while (i < text.length) {
      if (text[i] !== '"') {
        i++;
        continue;
      }

      const start = i;
      const end = findStringEnd(text, start);

      if (start < cursor && cursor <= end) {
        return { start, end };
      }

      i = end;
    }

    return null;
  }

  // Число или литерал, который пользователь уже начал вводить.
  if (query.length > 0) {
    const start = cursor - query.length;
    let end = cursor;

    while (
      end < text.length &&
      !/[\x20\t\r\n,}\]]/.test(text[end])
    ) {
      end++;
    }

    return { start, end };
  }

  // Курсор может находиться перед уже существующим значением.
  let start = cursor;

  while (
    start < text.length &&
    /[\x20\t\r\n]/.test(text[start])
  ) {
    start++;
  }

  if (text[start] === '"') {
    return {
      start,
      end: findStringEnd(text, start),
    };
  }

  if (start < text.length && /[-0-9tfn]/.test(text[start])) {
    let end = start;

    while (
      end < text.length &&
      !/[\x20\t\r\n,}\]]/.test(text[end])
    ) {
      end++;
    }

    return { start, end };
  }

  // Объекты и массивы не заменяем скалярной подсказкой.
  if (text[start] === "{" || text[start] === "[") {
    return null;
  }

  return { start: cursor, end: cursor };
}

// Переводим позицию в общей строке обратно в координаты Draft.js.
function locateOffset(content: ContentState, offset: number) {
  let remaining = offset;

  for (const block of content.getBlocksAsArray()) {
    const length = block.getLength();

    if (remaining <= length) {
      return {
        key: block.getKey(),
        offset: remaining,
      };
    }

    remaining -= length + 1;
  }

  throw new Error("Offset is outside the document.");
}

export function insertJsonSuggestion(
  editorState: EditorState,
  suggestion: JsonSuggestion,
): EditorState {
  const input = getJsonEditorInput(editorState);

  if (!input) {
    return editorState;
  }

  const context = getJsonContext(input.text, input.cursor);

  if (
    context.kind === "none" ||
    context.kind !== suggestion.kind
  ) {
    return editorState;
  }

  const range = findTokenRange(
    input.text,
    input.cursor,
    context.insideString,
    context.query,
  );

  if (!range) {
    return editorState;
  }

  let replacement: string;
  let caret: number;

  if (suggestion.kind === "property") {
    replacement = JSON.stringify(suggestion.propertyName);

    const suffix = input.text.slice(range.end);
    const existingColon = suffix.match(/^[\x20\t\r\n]*:[\x20\t\r\n]*/);

    if (existingColon) {
      // Двоеточие уже есть — сохраняем его и переходим за него.
      caret =
        range.start +
        replacement.length +
        existingColon[0].length;
    } else {
      replacement += ": ";
      caret = range.start + replacement.length;
    }
  } else {
    replacement = JSON.stringify(suggestion.value);

    // Для строки ставим курсор перед закрывающей кавычкой.
    // Для числа, boolean и null — после значения.
    caret =
      range.start +
      replacement.length -
      (typeof suggestion.value === "string" ? 1 : 0);
  }

  const content = editorState.getCurrentContent();

  const start = locateOffset(content, range.start);
  const end = locateOffset(content, range.end);

  const selection = SelectionState.createEmpty(start.key).merge({
    anchorOffset: start.offset,
    focusKey: end.key,
    focusOffset: end.offset,
  });

  const nextContent = Modifier.replaceText(
    content,
    selection,
    replacement,
    editorState.getCurrentInlineStyle(),
  );

  const nextState = EditorState.push(
    editorState,
    nextContent,
    "insert-characters",
  );

  const target = locateOffset(nextContent, caret);

  const nextSelection = SelectionState.createEmpty(target.key).merge({
    anchorOffset: target.offset,
    focusOffset: target.offset,
    hasFocus: true,
  });

  return EditorState.forceSelection(nextState, nextSelection);
}