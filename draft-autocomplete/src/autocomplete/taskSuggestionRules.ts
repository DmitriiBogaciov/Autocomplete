import type { JsonSuggestionRule } from "./jsonSuggestions";

const fields = [
  {
    name: "title",
    description: "Short title of the task.",
    priority: 10,
    contextWeight: 1,
  },
  {
    name: "status",
    description: "Current progress of the task.",
    priority: 9,
    contextWeight: 2,
  },
  {
    name: "priority",
    description: "Importance of the task.",
    priority: 8,
    contextWeight: 2,
  },
  {
    name: "description",
    description: "Detailed description.",
    priority: 6,
    contextWeight: 0,
  },
];

const rootRules: JsonSuggestionRule[] = [
  {
    kind: "property",
    path: [],
    suggestions: fields.map((field) => ({
      kind: "property" as const,
      id: `task-property:${field.name}`,
      label: field.name,
      description: field.description,
      priority: field.priority,
      propertyName: field.name,
      contextWeight: field.contextWeight,
    })),
  },
  {
    kind: "value",
    path: ["status"],
    suggestions: ["todo", "in_progress", "done"].map(
      (status) => ({
        kind: "value" as const,
        id: `task-status:${status}`,
        label: status,
        description: "",
        priority: 0,
        value: status,
      }),
    ),
  },
  {
    kind: "value",
    path: ["priority"],
    suggestions: ["high", "medium", "low"].map(
      (priority) => ({
        kind: "value" as const,
        id: `task-priority:${priority}`,
        label: priority,
        description: "",
        priority: 0,
        value: priority,
      }),
    ),
  },
];

export const taskSuggestionRules: JsonSuggestionRule[] = [
  ...rootRules,
  ...rootRules.map(
    (rule): JsonSuggestionRule => ({
      ...rule,
      path: [null, ...rule.path],
    }),
  ),
];