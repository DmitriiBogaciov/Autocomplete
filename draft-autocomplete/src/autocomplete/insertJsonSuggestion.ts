import {
  EditorState,
  Modifier,
  SelectionState,
} from "draft-js";
import type { ContentState } from "draft-js";
import type { JsonSuggestion } from "./suggestions";
import { getJsonEditorInput } from "./getJsonEditorInput";
import { getJsonContext } from "./getJsonContext";
import { analyzeJsonDocument } from "./analyzeJsonDocument";
import { getJsonIndentation } from "./jsonIndentation";
import type { ObjectScope } from "./analyzeJsonDocument";

type TextRange = {
  start: number;
  end: number;
};

function findStringRange(
  text: string,
  start: number,
  cursor: number,
  kind: "property" | "value",
): TextRange | null {
  let i = start + 1;

  while (i < text.length) {
    const char = text[i];

    if (char === "\n" || char === "\r") {
      break;
    }

    if (char === "\\") {
      if (
        i + 1 >= text.length ||
        text[i + 1] === "\n" ||
        text[i + 1] === "\r"
      ) {
        return null;
      }

      i += 2;
      continue;
    }

    if (char === '"') {
      const end = i + 1;

      try {
        JSON.parse(text.slice(start, end));
      } catch {
        return null;
      }

      // Проверяем, что после кавычки находится
      // правдоподобная граница токена.
      const remainder = text
        .slice(end)
        .replace(/^[\x20\t\r\n]*/, "");

      const next = remainder[0];

      const validBoundary =
        next === undefined ||
        (kind === "property"
          ? next === ":" || next === "}" || next === ","
          : next === "," || next === "}" || next === "]");

      if (!validBoundary) {
        return null;
      }

      return { start, end };
    }

    i++;
  }

  if (cursor <= start || cursor > i) {
    return null;
  }

  const textAfterCursor = text.slice(cursor, i);

  if (!/^[ \t]*$/.test(textAfterCursor)) {
    return null;
  }

  try {
    JSON.parse(text.slice(start, cursor) + '"');
  } catch {
    return null;
  }

  return { start, end: cursor };
}

function findTokenRange(
  text: string,
  cursor: number,
  insideString: boolean,
  query: string,
  kind: "property" | "value",
): TextRange | null {
  if (insideString) {
    let i = 0;

    while (i < cursor) {
      if (text[i] !== '"') {
        i++;
        continue;
      }

      const start = i;
      i++;

      let closed = false;

      while (i < cursor) {
        if (text[i] === "\n" || text[i] === "\r") {
          return null;
        }

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
        return findStringRange(text, start, cursor, kind);
      }
    }

    return null;
  }

  if (kind === "property") {
    return { start: cursor, end: cursor };
  }

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

  let start = cursor;

  while (
    start < text.length &&
    /[ \t]/.test(text[start])
  ) {
    start++;
  }
  if (text[start] === '"') {
    return findStringRange(text, start, cursor, kind);
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

  if (text[start] === "{" || text[start] === "[") {
    return null;
  }

  return { start: cursor, end: cursor };
}

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

function getPropertyIndent(
  text: string,
  cursor: number,
  objectDepth: number,
): string {
  const analysis = analyzeJsonDocument(text);

  let currentObject: ObjectScope | undefined;

  for (const object of analysis.objects) {
    if (object.start < cursor && cursor <= object.end) {
      if (!currentObject || object.start > currentObject.start) {
        currentObject = object;
      }
    }
  }

  if (currentObject) {
    for (const property of currentObject.properties) {
      const lineStart =
        text.lastIndexOf("\n", property.start - 1) + 1;

      const prefix = text.slice(lineStart, property.start);

      if (/^[ \t]+$/.test(prefix)) {
        return prefix;
      }
    }
  }

  const layout = getJsonIndentation(text, cursor);

  if (layout !== null) {
    return layout.indent;
  }

  return "\t".repeat(objectDepth);
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
    context.kind,
  );

  if (!range) {
    return editorState;
  }

  const lastPathPart = context.path[context.path.length - 1];

  const isArrayValue =
    context.kind === "value" &&
    typeof lastPathPart === "number";


  let indentation = "";

  if (
    (suggestion.kind === "property" || isArrayValue) &&
    !context.insideString &&
    range.start === range.end
  ) {
    const lineStart = input.text.lastIndexOf("\n", range.start - 1) + 1;

    const linePrefix = input.text.slice(lineStart, range.start);

    if (/^[ \t]*$/.test(linePrefix)) {
      if (suggestion.kind === "property") {
        indentation = getPropertyIndent(
          input.text,
          input.cursor,
          context.path.length + 1,
        );

        range.start = lineStart;
      } else {
        const layout = getJsonIndentation(
          input.text,
          input.cursor,
        );

        if (layout !== null) {
          indentation = layout.indent;
          range.start = lineStart;
        }
      }
    }
  }

  let replacement: string;
  let caret: number;

  if (suggestion.kind === "property") {
    replacement = indentation + JSON.stringify(suggestion.propertyName);

    const suffix = input.text.slice(range.end);
    const existingColon = suffix.match(/^[\x20\t\r\n]*:[\x20\t\r\n]*/);

    if (existingColon) {
      caret =
        range.start +
        replacement.length +
        existingColon[0].length;
    } else {
      replacement += ": ";
      caret = range.start + replacement.length;
    }
  } else {
    replacement = indentation + JSON.stringify(suggestion.value);

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