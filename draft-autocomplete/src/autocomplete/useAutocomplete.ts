import { useState, useRef, useEffect, useMemo } from "react";
import type { KeyboardEvent } from "react";
import { EditorState, Modifier } from "draft-js";
import type { DraftHandleValue } from "draft-js";
import { useSuggestionPosition } from "./useSuggestionPosition";
import { getJsonEditorInput } from "./getJsonEditorInput";
import { getJsonContext } from "./getJsonContext";
import { insertJsonSuggestion } from "./insertJsonSuggestion";
import { analyzeJsonDocument } from "./analyzeJsonDocument";
import { getDocumentSuggestions } from "./getDocumentSuggestions";
import { getConfiguredSuggestions } from "./suggestions";
import { getJsonIndentation } from "./jsonIndentation";

import type { JsonSuggestion } from "./suggestions";
import type { AutocompleteConfig } from "./configuration";

export type EditorMode = "plain" | "json";

export function useAutocomplete(config: AutocompleteConfig) {
    const [editorState, setEditorState] = useState(() => EditorState.createEmpty());
    const [activeIndex, setActiveIndex] = useState(-1);
    const [isDismissed, setIsDismissed] = useState(false);
    const [mode, setMode] = useState<EditorMode>("json");
    const suggestionListRef = useRef<HTMLUListElement>(null);

    const jsonInput = useMemo(
        () => mode === "json" ? getJsonEditorInput(editorState) : null,
        [editorState, mode],
    );

    const jsonContext = useMemo(
        () =>
            jsonInput
                ? getJsonContext(jsonInput.text, jsonInput.cursor)
                : null,
        [jsonInput],
    );

    const content = editorState.getCurrentContent();

    const documentAnalysis = useMemo(
        () => mode === "json" ? analyzeJsonDocument(content.getPlainText("\n"))
            : {
                objects: [],
                values: [],
            },
        [content, mode],
    );

    const documentSuggestions = useMemo(
        () =>
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
                },
        [documentAnalysis, jsonContext, jsonInput],
    );

    const isBeforeExistingProperty = useMemo(() => {
        if (
            !jsonInput ||
            jsonContext?.kind !== "property" ||
            jsonContext.insideString
        ) {
            return false;
        }

        const textAfterCursor = jsonInput.text.slice(jsonInput.cursor);
        const lineEnd = textAfterCursor.indexOf("\n");

        const restOfLine =
            lineEnd === -1
                ? textAfterCursor
                : textAfterCursor.slice(0, lineEnd);

        return restOfLine.trimStart().startsWith('"');
    }, [jsonInput, jsonContext]);

    function handleBeforeInput(
        characters: string,
    ): DraftHandleValue {
        return insertClosingCharacter(characters)
            ? "handled"
            : "not-handled";
    }

    function insertClosingCharacter(character: string): boolean {
        if (mode != "json") {
            return false
        }

        if (character != "}" && character != "]") {
            return false
        }

        const input = getJsonEditorInput(editorState)
        if (input === null) {
            return false
        }

        const layout = getJsonIndentation(input.text, input.cursor)
        if (layout === null || layout.closingCharacter !== character) {
            return false
        }

        const lineStart = input.text.lastIndexOf("\n", input.cursor - 1) + 1;

        const linePrefix = input.text.slice(lineStart, input.cursor);
        if (!/^[ \t]*$/.test(linePrefix)) {
            return false;
        }

        const selection = editorState.getSelection();

        const replacementSelection = selection.merge({
            anchorOffset: 0,
            focusOffset: input.blockOffset,
        });

        const replacement = layout.closingIndent + character;

        const nextContent = Modifier.replaceText(
            editorState.getCurrentContent(),
            replacementSelection,
            replacement,
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

    const canShowSuggestions = useMemo(() => {
        if (!jsonInput || !jsonContext || jsonContext.kind === "none") {
            return false;
        }

        if (jsonContext.kind === "value" || jsonContext.insideString) {
            return true;
        }

        const lineStart =
            jsonInput.text.lastIndexOf("\n", jsonInput.cursor - 1) + 1;

        const textBeforeCursorOnLine = jsonInput.text.slice(
            lineStart,
            jsonInput.cursor,
        );

        return /^[ \t]*$/.test(textBeforeCursorOnLine);
    }, [jsonInput, jsonContext]);

    const suggestions = useMemo<JsonSuggestion[]>(() => {
        if (
            !jsonContext ||
            !jsonInput ||
            isDismissed ||
            isBeforeExistingProperty ||
            !canShowSuggestions
        ) {
            return [];
        }

        return getConfiguredSuggestions(
            jsonContext,
            config,
            documentSuggestions,
            {
                analysis: documentAnalysis,
                cursor: jsonInput.cursor,
            },
        );
    }, [
        jsonContext,
        jsonInput,
        isDismissed,
        isBeforeExistingProperty,
        canShowSuggestions,
        config,
        documentSuggestions,
        documentAnalysis,
    ]);

    const editorContainerRef = useRef<HTMLDivElement>(null);

    const suggestionPosition = useSuggestionPosition(
        editorContainerRef,
        editorState,
        suggestions.length > 0,
    );

    function handleModeChange(nextMode: EditorMode) {
        if (nextMode === mode) {
            return;
        }
        setMode(nextMode);
        setActiveIndex(-1);
        setIsDismissed(false);
    }

    function handleSuggestionSelect(suggestion: JsonSuggestion) {
        if (mode !== "json") {
            return;
        }

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
        const previousSelection = editorState.getSelection();
        const nextSelection = nextState.getSelection();

        const selectionChanged =
            previousSelection.getAnchorKey() !== nextSelection.getAnchorKey() ||
            previousSelection.getAnchorOffset() !== nextSelection.getAnchorOffset() ||
            previousSelection.getFocusKey() !== nextSelection.getFocusKey() ||
            previousSelection.getFocusOffset() !== nextSelection.getFocusOffset();

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
        if (mode === "plain") {
            if (
                event.key === "Tab" &&
                !event.nativeEvent.isComposing &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey &&
                !event.shiftKey
            ) {
                if (insertTab()) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }

            return;
        }

        if (
            event.nativeEvent.isComposing ||
            editorState.isInCompositionMode() ||
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

        if (event.altKey) {
            if (
                isMenuVisible &&
                (event.key === "Enter" || event.key === "Tab")
            ) {
                const suggestion = suggestions[activeIndex];

                if (suggestion !== undefined) {
                    consumeEvent();
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

        if (event.key === "Enter") {
            if (insertJsonNewline()) {
                consumeEvent();
                return;
            }
        }

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

    }
    function insertTab(): boolean {
        const selection = editorState.getSelection();

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

    function insertJsonNewline(): boolean {
        if (mode !== "json") { return false }

        const selection = editorState.getSelection();
        if (!selection.isCollapsed()) {
            return false;
        }

        const input = getJsonEditorInput(editorState);
        if (!input) {
            return false;
        }

        const jsonIndentation = getJsonIndentation(input.text, input.cursor);
        if (!jsonIndentation) {
            return false;
        }

        const content = editorState.getCurrentContent();

        const currentBlock = content.getBlockForKey(selection.getStartKey());

        const text = currentBlock.getText();
        const rightText = text.slice(selection.getStartOffset());

        const match = rightText.match(/^[ \t]*/)?.[0];
        const leadingWhitespace = match ?? "";

        const rightContent = rightText.slice(leadingWhitespace.length);

        let nextContent = Modifier.splitBlock(content, selection);
        const nextSelection = nextContent.getSelectionAfter();

        if (leadingWhitespace.length > 0) {
            const whitespaceSelection = nextSelection.merge({
                anchorOffset: 0,
                focusOffset: leadingWhitespace.length,
            });

            nextContent = Modifier.removeRange(
                nextContent,
                whitespaceSelection,
                "forward",
            );
        }

        nextContent = Modifier.insertText(
            nextContent,
            nextSelection,
            jsonIndentation.indent,
        );

        const caretSelection = nextContent.getSelectionAfter();

        const beforeClosingCharacter =
            jsonIndentation.closingCharacter !== null &&
            rightContent.startsWith(jsonIndentation.closingCharacter);

        if (beforeClosingCharacter) {
            nextContent = Modifier.splitBlock(
                nextContent,
                caretSelection,
            );

            const closingSelection = nextContent.getSelectionAfter();

            nextContent = Modifier.insertText(
                nextContent,
                closingSelection,
                jsonIndentation.closingIndent,
            );
        }

        const nextEditorState = EditorState.push(
            editorState,
            nextContent,
            "split-block",
        )

        const focusedEditorState = EditorState.forceSelection(
            nextEditorState,
            caretSelection,
        )

        handleEditorChange(focusedEditorState);

        return true;
    }

    return {
        editorState,
        mode,
        editorContainerRef,
        suggestionListRef,
        suggestions,
        suggestionPosition,
        activeIndex,
        handleEditorChange,
        handleKeyDown,
        handleSuggestionSelect,
        handleModeChange,
        handleBeforeInput,
    };
}