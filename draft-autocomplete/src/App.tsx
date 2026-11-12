import { Editor } from "draft-js";
import { createPortal } from "react-dom";
import "draft-js/dist/Draft.css";

import { useAutocomplete } from "./autocomplete/useAutocomplete";
import {
  autocompleteConfig,
  configurationErrors,
} from "./autocomplete/configuration";

function App() {
  const {
    editorState,
    editorContainerRef,
    suggestionListRef,
    suggestions,
    suggestionPosition,
    activeIndex,
    jsonInput,
    jsonContext,
    handleEditorChange,
    handleKeyDown,
    handleSuggestionSelect,
  } = useAutocomplete(autocompleteConfig);

  return (
    <div
      style={{
        maxWidth: 800,
        margin: "40px auto",
        fontFamily: "sans-serif",
      }}
    >
      <h1>Draft.js — Autocomplete</h1>

      {configurationErrors.length > 0 && (
        <div
          role="alert"
          style={{
            marginBottom: 16,
            padding: 12,
            background: "#fff1f0",
            color: "#9f1239",
            textAlign: "left",
          }}
        >
          <strong>Some configurations could not be loaded:</strong>

          <ul>
            {configurationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

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
          placeholder="Start typing JSON…"
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
                    background:
                      index === activeIndex ? "#dbeafe" : "#fff",
                    color: "#111",
                  }}
                >
                  <strong>{suggestion.label}</strong>

                  {suggestion.description && (
                    <span
                      style={{
                        display: "block",
                        marginTop: 4,
                      }}
                    >
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
          <div>Document cursor position: {jsonInput.cursor}</div>

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
    </div>
  );
}

export default App;