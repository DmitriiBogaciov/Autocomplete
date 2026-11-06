import { EditorState, Modifier, SelectionState } from "draft-js";
import type { EditorWordContext } from "./getEditorWordContext";

export function insertSuggestion(
    editorState: EditorState,
    context: EditorWordContext,
    suggestion: string,
): EditorState {

    const replacementRange = SelectionState.createEmpty(context.blockKey).merge({
        anchorOffset: context.start,
        focusOffset: context.end,
    })

    console.log("Replacement range:", replacementRange.getAnchorOffset(), replacementRange.getFocusOffset());

    const nextContent = Modifier.replaceText(
        editorState.getCurrentContent(),
        replacementRange,
        suggestion,
        editorState.getCurrentInlineStyle(),
    );

    const nextEditorState = EditorState.push(
        editorState,
        nextContent,
        "insert-characters",
    )
    return EditorState.forceSelection(nextEditorState, nextContent.getSelectionAfter());
}