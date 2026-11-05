import { useState, useEffect } from "react";
import { Editor, EditorState } from "draft-js";
import "draft-js/dist/Draft.css";
import { getEditorWordContext } from "./autocomplete/getEditorWordContext"

function App() {
  const [editorState, setEditorState] = useState(() =>
    EditorState.createEmpty()
  );


  const wordContext = getEditorWordContext(editorState);
  console.log("Word context:", wordContext);

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