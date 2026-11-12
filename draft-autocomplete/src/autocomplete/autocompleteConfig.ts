import type { JsonSuggestionRule } from "./jsonSuggestions";
import { apiSuggestionRules } from "./apiSuggestionRules";
import { taskSuggestionRules } from "./taskSuggestionRules";

export type AutocompleteConfig = {
  groupBoostFactor: number;

  groups: Array<{
    id: string;
    rules: JsonSuggestionRule[];
  }>;
};

export const autocompleteConfig: AutocompleteConfig = {
  groupBoostFactor: 10,

  groups: [
    {
      id: "api",
      rules: apiSuggestionRules,
    },
    {
      id: "task",
      rules: taskSuggestionRules,
    },
  ],
};