import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import type { EditorState } from "draft-js";

type SuggestionPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

export function useSuggestionPosition(
  containerRef: RefObject<HTMLDivElement | null>,
  editorState: EditorState,
  isOpen: boolean,
): SuggestionPosition | null {
  const [position, setPosition] =
    useState<SuggestionPosition | null>(null);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    function updatePosition() {
      const container = containerRef.current;
      const selection = window.getSelection();

      if (
        !container ||
        !selection ||
        selection.rangeCount === 0 ||
        !selection.isCollapsed ||
        !selection.anchorNode ||
        !container.contains(selection.anchorNode)
      ) {
        setPosition(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const rect =
        range.getClientRects()[0] ?? range.getBoundingClientRect();

      // Если браузер не вернул геометрию курсора, список не показываем.
      if (rect.height === 0) {
        setPosition(null);
        return;
      }

      const margin = 8;
      const gap = 4;
      const preferredHeight = 200;

      const width = Math.min(
        240,
        Math.max(0, window.innerWidth - margin * 2),
      );

      const spaceBelow = Math.max(
        0,
        window.innerHeight - rect.bottom - gap - margin,
      );

      const spaceAbove = Math.max(
        0,
        rect.top - gap - margin,
      );

      const showAbove =
        spaceBelow < preferredHeight && spaceAbove > spaceBelow;

      const maxHeight = Math.min(
        preferredHeight,
        showAbove ? spaceAbove : spaceBelow,
      );

      const left = Math.max(
        margin,
        Math.min(rect.left, window.innerWidth - width - margin),
      );

      const top = showAbove
        ? rect.top - gap - maxHeight
        : rect.bottom + gap;

      // Курсор прокручен за пределы окна.
      if (
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        maxHeight === 0
      ) {
        setPosition(null);
        return;
      }

      setPosition({ left, top, width, maxHeight });
    }

    // Даём Draft.js завершить обновление DOM-выделения.
    let frame = requestAnimationFrame(updatePosition);

    function scheduleUpdate() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updatePosition);
    }

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    document.addEventListener("selectionchange", scheduleUpdate);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      document.removeEventListener("selectionchange", scheduleUpdate);
    };
  }, [containerRef, editorState, isOpen]);

  return isOpen ? position : null;
}