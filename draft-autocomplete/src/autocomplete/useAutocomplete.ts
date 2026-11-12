import { useState, useRef, useEffect, useMemo } from "react";
import type { KeyboardEvent } from "react";
import { EditorState, Modifier } from "draft-js";

import { useSuggestionPosition } from "./useSuggestionPosition";
import { getJsonEditorInput } from "./getJsonEditorInput";
import { getJsonContext } from "./getJsonContext";
import { insertJsonSuggestion } from "./insertJsonSuggestion";
import { analyzeJsonDocument } from "./analyzeJsonDocument";
import { getDocumentSuggestions } from "./getDocumentSuggestions";
import { getConfiguredSuggestions } from "./suggestions";

import type { JsonSuggestion } from "./suggestions";
import type { AutocompleteConfig } from "./configuration";

export function useAutocomplete(config: AutocompleteConfig) {
    const [editorState, setEditorState] = useState(() => EditorState.createEmpty());
    const [activeIndex, setActiveIndex] = useState(-1);
    const [isDismissed, setIsDismissed] = useState(false);
    const suggestionListRef = useRef<HTMLUListElement>(null);

    const jsonInput = useMemo(
        () => getJsonEditorInput(editorState),
        [editorState],
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
        () => analyzeJsonDocument(content.getPlainText("\n")),
        [content],
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

    return {
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
    };
}