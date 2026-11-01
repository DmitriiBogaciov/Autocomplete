import { useState } from "react";
import { Editor, EditorState } from "draft-js";
import "draft-js/dist/Draft.css";

function App() {
  const [editorState, setEditorState] = useState(() =>
    EditorState.createEmpty()
  );

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
    </div>
  );
}

export default App;