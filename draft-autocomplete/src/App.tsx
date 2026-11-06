import { useState } from "react";
import { Editor, EditorState } from "draft-js";
import "draft-js/dist/Draft.css";
import { getEditorWordContext } from "./autocomplete/getEditorWordContext"
import { getSuggestions } from "./autocomplete/getSuggestions";
import { dictionary } from "./autocomplete/dictionary";
import { insertSuggestion } from "./autocomplete/insertSuggestion";

function App() {
  const [editorState, setEditorState] = useState(() =>
    EditorState.createEmpty()
  );


  const wordContext = getEditorWordContext(editorState);

  const suggestions = wordContext ? getSuggestions(wordContext.prefix, dictionary) : [];
  // console.log("Word context:", wordContext);

  function handleSuggestionSelect(suggestion: string) {
    if (!wordContext) return;

    const nextEditorState = insertSuggestion(
      editorState,
      wordContext,
      suggestion,
    )

    setEditorState(nextEditorState);
  }

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Draft.js — первый редактор</h1>

      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: 16,
          minHeight: 200,
          background: "#fff"
        }}
      >
        <Editor
          editorState={editorState}
          onChange={setEditorState}
          placeholder="Začni psát text…"
        />
      </div>

      {suggestions.length > 0 && (
        <ul>
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => handleSuggestionSelect(suggestion)}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
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