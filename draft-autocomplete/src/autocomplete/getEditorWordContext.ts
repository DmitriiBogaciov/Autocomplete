import type { EditorState } from "draft-js";
import { getWordContext } from "./getWordContext";
import type { WordContext } from "./getWordContext";

export type EditorWordContext = WordContext & {
  blockKey: string;
};

export function getEditorWordContext(
  editorState: EditorState,
): EditorWordContext | null {
  const selection = editorState.getSelection();

  if (
    !selection.getHasFocus() ||
    !selection.isCollapsed() ||
    editorState.isInCompositionMode()
  ) {
    return null;
  }

  const blockKey = selection.getStartKey();
  const cursor = selection.getStartOffset();

  const content = editorState.getCurrentContent();
  const block = content.getBlockForKey(blockKey);
  const text = block.getText();

//   console.log(`Block key: ${blockKey}, Block: ${block.getText()}, Content: ${content.getPlainText()}, Cursor: ${cursor}, Text: "${text}"`);

  const context = getWordContext(text, cursor);

  if (!context) {
    return null;
  }

  return {
    ...context,
    blockKey,
  };
}