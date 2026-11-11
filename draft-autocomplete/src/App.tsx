import { useState, useRef, useEffect, useMemo } from "react";
import { Editor, EditorState, Modifier } from "draft-js";
import "draft-js/dist/Draft.css";
import { useSuggestionPosition } from "./autocomplete/useSuggestionPosition";
import { getJsonEditorInput } from "./autocomplete/getJsonEditorInput";
import { getJsonContext } from "./autocomplete/getJsonContext.ts";
import { getJsonSuggestions } from "./autocomplete/jsonSuggestions";
import { apiSuggestionRules } from "./autocomplete/apiSuggestionRules";
import { insertJsonSuggestion } from "./autocomplete/insertJsonSuggestion";
import type { JsonSuggestion } from "./autocomplete/jsonSuggestions";
import { analyzeJsonDocument } from "./autocomplete/analyzeJsonDocument";
import { getDocumentSuggestions } from "./autocomplete/getDocumentSuggestions";
import { createPortal } from "react-dom";
import type { KeyboardEvent } from "react";

function App() {
  const [editorState, setEditorState] = useState(() => EditorState.createEmpty());
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isDismissed, setIsDismissed] = useState(false);
  const suggestionListRef = useRef<HTMLUListElement>(null);

  const jsonInput = getJsonEditorInput(editorState);

  const jsonContext = jsonInput
    ? getJsonContext(jsonInput.text, jsonInput.cursor)
    : null;

  const content = editorState.getCurrentContent();

  const documentAnalysis = useMemo(
    () => analyzeJsonDocument(content.getPlainText("\n")),
    [content],
  );

  const documentSuggestions =
    jsonInput && jsonContext
      ? getDocumentSuggestions(
        documentAnalysis,
        jsonContext,
        jsonInput.cursor,
      )
      : {
        existingNames: [],
        siblingNames: [],
        valueSuggestions: [],
      };

  const isBeforeExistingProperty = (() => {
    if (
      !jsonInput ||
      jsonContext?.kind !== "property" ||
      jsonContext.insideString
    ) {
      return false;
    }

    const textAfterCursor = jsonInput.text.slice(jsonInput.cursor);

    // Проверяем только остаток текущей строки.
    const lineEnd = textAfterCursor.indexOf("\n");

    const restOfLine =
      lineEnd === -1
        ? textAfterCursor
        : textAfterCursor.slice(0, lineEnd);

    return restOfLine.trimStart().startsWith('"');
  })();

  const suggestions =
    jsonContext &&
      jsonInput &&
      !isDismissed &&
      !isBeforeExistingProperty
      ? getJsonSuggestions(
        jsonContext,
        apiSuggestionRules,
        documentSuggestions.existingNames,
        documentSuggestions.siblingNames,
        documentSuggestions.valueSuggestions,
        {
          analysis: documentAnalysis,
          cursor: jsonInput.cursor,
        },
      )
      : [];

  const editorContainerRef = useRef<HTMLDivElement>(null);

  const suggestionPosition = useSuggestionPosition(
    editorContainerRef,
    editorState,
    suggestions.length > 0,
  );

  function handleSuggestionSelect(suggestion: JsonSuggestion) {
    const nextState = insertJsonSuggestion(
      editorState,
      suggestion,
    );

    if (nextState === editorState) {
      return;
    }

    setEditorState(nextState);
    setActiveIndex(-1);
    setIsDismissed(suggestion.kind === "value");
  }

  function handleEditorChange(nextState: EditorState) {
    const contentChanged = nextState.getCurrentContent() !== editorState.getCurrentContent();

    const selectionChanged = !nextState.getSelection().equals(editorState.getSelection());

    if (contentChanged || selectionChanged) {
      setActiveIndex(-1);
      setIsDismissed(false);
    }

    setEditorState(nextState);
  }

  useEffect(() => {
    const list = suggestionListRef.current;

    const button = list?.querySelector<HTMLButtonElement>(
      '[data-active="true"]',
    );

    if (!list || !button) {
      return;
    }

    const listRect = list.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();

    const visibleTop = listRect.top + list.clientTop;
    const visibleBottom = visibleTop + list.clientHeight;

    if (buttonRect.top < visibleTop) {
      list.scrollTop -= visibleTop - buttonRect.top;
    } else if (buttonRect.bottom > visibleBottom) {
      list.scrollTop += buttonRect.bottom - visibleBottom;
    }
  }, [activeIndex, suggestions.length, suggestionPosition]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.nativeEvent.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }

    const isMenuVisible =
      !isDismissed &&
      suggestions.length > 0 &&
      suggestionPosition !== null;

    function consumeEvent() {
      event.preventDefault();
      event.stopPropagation();
    }

    // Пока удерживается Alt, стрелки листают подсказки.
    if (
      event.altKey &&
      (event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      if (!isMenuVisible) {
        return;
      }

      consumeEvent();

      const direction = event.key === "ArrowDown" ? 1 : -1;

      setActiveIndex((index) => {
        if (index < 0) {
          return direction === 1 ? 0 : suggestions.length - 1;
        }

        return (
          index + direction + suggestions.length
        ) % suggestions.length;
      });

      return;
    }

    // Другие сочетания с Alt оставляем браузеру.
    if (event.altKey) {
      if (
        isMenuVisible &&
        (event.key === "Enter" || event.key === "Tab")
      ) {
        consumeEvent();

        const suggestion = suggestions[activeIndex];

        if (suggestion !== undefined) {
          handleSuggestionSelect(suggestion);
        }
      }

      return;
    }

    if (event.key === "Escape" && isMenuVisible) {
      consumeEvent();
      setIsDismissed(true);
      setActiveIndex(-1);
      return;
    }

    const selectedSuggestion =
      isMenuVisible && activeIndex >= 0
        ? suggestions[activeIndex]
        : undefined;

    if (
      (event.key === "Enter" || event.key === "Tab") &&
      selectedSuggestion !== undefined
    ) {
      consumeEvent();
      handleSuggestionSelect(selectedSuggestion);
      return;
    }

    // Обычные стрелки возвращают управление редактору.
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight"
    ) {
      setActiveIndex(-1);
      return;
    }

    if (event.key === "Tab" && insertTab()) {
      consumeEvent();
    }

    // Enter без выбранной подсказки создаёт новую строку.
  }
  function insertTab(): boolean {
    const selection = editorState.getSelection();

    // Пока поддерживаем вставку только в позиции курсора.
    // Выделенный текст не заменяем табуляцией.
    if (!selection.isCollapsed()) {
      return false;
    }

    const nextContent = Modifier.insertText(
      editorState.getCurrentContent(),
      selection,
      "\t",
      editorState.getCurrentInlineStyle(),
    );

    const nextState = EditorState.push(
      editorState,
      nextContent,
      "insert-characters",
    );

    const focusedState = EditorState.forceSelection(
      nextState,
      nextContent.getSelectionAfter(),
    );

    handleEditorChange(focusedState);

    return true;
  }

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Draft.js — Autocomplete</h1>

      <div
        ref={editorContainerRef}
        onKeyDownCapture={handleKeyDown}
        style={{
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: 16,
          minHeight: 200,
          background: "#fff",
          color: "#111",
          textAlign: "left",
          tabSize: 2,
        }}
      >
        <Editor
          editorState={editorState}
          onChange={handleEditorChange}
          placeholder="Начните вводить JSON…"
        />
      </div>

      {suggestions.length > 0 &&
        suggestionPosition &&
        createPortal(
          <ul
            ref={suggestionListRef}
            style={{
              position: "fixed",
              left: suggestionPosition.left,
              top: suggestionPosition.top,
              width: suggestionPosition.width,
              maxHeight: suggestionPosition.maxHeight,
              overflowY: "auto",
              boxSizing: "border-box",
              zIndex: 1000,
              margin: 0,
              padding: 4,
              listStyle: "none",
              background: "#fff",
              border: "1px solid #ddd",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
            }}
          >
            {suggestions.map((suggestion, index) => (
              <li key={suggestion.id}>
                <button
                  type="button"
                  data-active={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSuggestionSelect(suggestion)}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "8px 12px",
                    border: 0,
                    borderRadius: 4,
                    textAlign: "left",
                    overflowWrap: "anywhere",
                    cursor: "pointer",
                    background: index === activeIndex ? "#dbeafe" : "#fff",
                    color: "#111",
                  }}
                >
                  <strong>{suggestion.label}</strong>

                  {suggestion.description && (
                    <span style={{ display: "block", marginTop: 4 }}>
                      {suggestion.description}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
      {jsonContext && (
        <pre
          style={{
            padding: 12,
            background: "#eee",
            color: "#111",
            textAlign: "left",
            whiteSpace: "pre-wrap",
          }}
        >
          {JSON.stringify(jsonContext, null, 2)}
        </pre>
      )}
      {jsonInput && (
        <div style={{ marginTop: 16, textAlign: "left" }}>
          <div>Позиция курсора в документе: {jsonInput.cursor}</div>

          <pre
            style={{
              padding: 12,
              background: "#eee",
              color: "#111",
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {jsonInput.text.slice(0, jsonInput.cursor)}
            {"│"}
            {jsonInput.text.slice(jsonInput.cursor)}
          </pre>
        </div>
      )}

      {/* {wordContext && (
        <div style={{ marginTop: 16 }}>
          <div>Введённая часть: {wordContext.prefix}</div>
          <div>Слово целиком: {wordContext.word}</div>
          <div>
            Границы слова: {wordContext.start}–{wordContext.end}
          </div>
        </div>
      )} */}

    </div>
  );
}

export default App;