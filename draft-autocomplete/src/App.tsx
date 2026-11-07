import { useState, useRef } from "react";
import { Editor, EditorState } from "draft-js";
import "draft-js/dist/Draft.css";
import { getEditorWordContext } from "./autocomplete/getEditorWordContext"
import { getSuggestions } from "./autocomplete/getSuggestions";
import { dictionary } from "./autocomplete/dictionary";
import { insertSuggestion } from "./autocomplete/insertSuggestion";
import { useSuggestionPosition } from "./autocomplete/useSuggestionPosition";
import { createPortal } from "react-dom";
import type { KeyboardEvent } from "react";

function App() {
  const [editorState, setEditorState] = useState(() =>
    EditorState.createEmpty()
  );

  const editorContainerRef = useRef<HTMLDivElement>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);

  const wordContext = getEditorWordContext(editorState);

  const suggestions =
    wordContext && !isDismissed
      ? getSuggestions(wordContext.prefix, dictionary)
      : [];

  const suggestionPosition = useSuggestionPosition(
    editorContainerRef,
    editorState,
    suggestions.length > 0,
  );

  function handleSuggestionSelect(suggestion: string) {
    if (!wordContext) return;

    const nextEditorState = insertSuggestion(
      editorState,
      wordContext,
      suggestion,
    )

    setEditorState(nextEditorState);
    setActiveIndex(0);
    setIsDismissed(true);
  }

  function handleEditorChange(nextState: EditorState) {
    const contentChanged = nextState.getCurrentContent() !== editorState.getCurrentContent();

    const selectionChanged = !nextState.getSelection().equals(editorState.getSelection());

    if (contentChanged || selectionChanged) {
      setActiveIndex(0);
      setIsDismissed(false);
    }

    setEditorState(nextState);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      suggestions.length === 0 ||
      event.nativeEvent.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    ) {
      return;
    }

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        event.stopPropagation();

        setActiveIndex(
          (index) => (index + 1) % suggestions.length
        );
        break;
      }

      case "ArrowUp": {
        event.preventDefault();
        event.stopPropagation();

        setActiveIndex(
          (index) =>
            (index - 1 + suggestions.length) % suggestions.length
        );
        break;
      }

      case "Enter": {
        const suggestion = suggestions[activeIndex];

        if (suggestion === undefined) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        handleSuggestionSelect(suggestion);
        break;
      }

      case "Escape": {
        event.preventDefault();
        event.stopPropagation();

        setIsDismissed(true);
        setActiveIndex(0);
        break;
      }
    }
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
        }}
      >
        <Editor
          editorState={editorState}
          onChange={handleEditorChange}
          placeholder="Začni psát text…"
        />
      </div>

      {suggestions.length > 0 &&
        suggestionPosition &&
        createPortal(
          <ul
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
              <li key={suggestion}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
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
                    background:
                      index === activeIndex ? "#dbeafe" : "#fff",
                    color: "#111",
                  }}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}

      {wordContext && (
        <div style={{ marginTop: 16 }}>
          <div>Введённая часть: {wordContext.prefix}</div>
          <div>Слово целиком: {wordContext.word}</div>
          <div>
            Границы слова: {wordContext.start}–{wordContext.end}
          </div>
        </div>
      )}

    </div>
  );
}

export default App;