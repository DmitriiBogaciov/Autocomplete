import { parseSuggestionGroup } from "./parseSuggestionGroup";
import type { SuggestionGroup } from "./parseSuggestionGroup";

export type AutocompleteConfig = {
  groupBoostFactor: number;
  groups: SuggestionGroup[];
};

// Загружаем содержимое как текст, чтобы самим обработать
// даже синтаксическую ошибку внутри JSON-файла.
const files = import.meta.glob<string>("./configs/*.json", {
  eager: true,
  query: "?raw",
  import: "default",
});

const groups: SuggestionGroup[] = [];
const usedIds = new Set<string>();

export const configurationErrors: string[] = [];

for (const [filename, source] of Object.entries(files).sort(
  ([first], [second]) => first.localeCompare(second),
)) {
  try {
    const parsed: unknown = JSON.parse(source);
    const group = parseSuggestionGroup(parsed);

    if (usedIds.has(group.id)) {
      throw new Error(`группа с id "${group.id}" уже загружена`);
    }

    usedIds.add(group.id);
    groups.push(group);
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : String(error);

    configurationErrors.push(`${filename}: ${message}`);
  }
}

export const autocompleteConfig: AutocompleteConfig = {
  groupBoostFactor: 10,
  groups,
};