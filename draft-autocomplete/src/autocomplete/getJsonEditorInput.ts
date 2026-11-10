import type { EditorState } from "draft-js";

export type JsonEditorInput = {
  text: string;
  cursor: number;
  blockKey: string;
  blockOffset: number;
};

export function getJsonEditorInput(
  editorState: EditorState,
): JsonEditorInput | null {
  const selection = editorState.getSelection();

  if (
    !selection.getHasFocus() ||
    !selection.isCollapsed() ||
    editorState.isInCompositionMode()
  ) {
    return null;
  }

  const blocks = editorState
    .getCurrentContent()
    .getBlocksAsArray();

  const blockKey = selection.getStartKey();
  const blockOffset = selection.getStartOffset();

  const lines: string[] = [];

  let currentOffset = 0;
  let cursor: number | null = null;

  for (const block of blocks) {
    const blockText = block.getText();

    if (block.getKey() === blockKey) {
      cursor = currentOffset + blockOffset;
    }

    lines.push(blockText);

    // Один символ переноса строки между блоками.
    currentOffset += blockText.length + 1;
  }

  if (cursor === null) {
    return null;
  }

  return {
    text: lines.join("\n"),
    cursor,
    blockKey,
    blockOffset,
  };
}