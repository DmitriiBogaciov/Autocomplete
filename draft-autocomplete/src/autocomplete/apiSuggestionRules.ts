import type { JsonSuggestionRule } from "./jsonSuggestions";

const rootApiSuggestionRules: JsonSuggestionRule[] = [
  {
    kind: "property",
    path: [],
    suggestions: [
      {
        kind: "property",
        id: "property-method",
        label: "method",
        description: "HTTP method of the operation.",
        priority: 10,
        propertyName: "method",
      },
      {
        kind: "property",
        id: "property-path",
        label: "path",
        description: "Endpoint path, for example /users.",
        priority: 9,
        propertyName: "path",
      },
      {
        kind: "property",
        id: "property-description",
        label: "description",
        description: "What the operation does.",
        priority: 8,
        propertyName: "description",
      },
      {
        kind: "property",
        id: "property-errors",
        label: "errors",
        description: "Possible error messages.",
        priority: 7,
        propertyName: "errors",
      },
    ],
  },
  {
    kind: "value",
    path: ["method"],
    suggestions: ["GET", "POST", "PUT", "PATCH", "DELETE"].map(
      (method) => ({
        kind: "value" as const,
        id: `method-${method}`,
        label: method,
        description: "",
        priority: 0,
        value: method,
      }),
    ),
  },
  {
    kind: "value",
    path: ["description"],
    suggestions: [
      {
        kind: "value",
        id: "description-list",
        label: "Returns a list of available resources.",
        description: "",
        priority: 10,
        value: "Returns a list of available resources.",
      },
      {
        kind: "value",
        id: "description-create",
        label: "Creates a new resource.",
        description: "",
        priority: 9,
        value: "Creates a new resource.",
      },
    ],
  },
  {
    kind: "value",
    path: ["errors", null],
    suggestions: [
      {
        kind: "value",
        id: "error-400",
        label: "400 Bad Request: invalid input data.",
        description: "",
        priority: 10,
        value: "400 Bad Request: invalid input data.",
      },
      {
        kind: "value",
        id: "error-401",
        label: "401 Unauthorized: missing or invalid access token.",
        description: "",
        priority: 8,
        value: "401 Unauthorized: missing or invalid access token.",
      },
      {
        kind: "value",
        id: "error-404",
        label: "404 Not Found: requested resource does not exist.",
        description: "",
        priority: 9,
        value: "404 Not Found: requested resource does not exist.",
      },
    ],
  },
];

export const apiSuggestionRules: JsonSuggestionRule[] = [
  ...rootApiSuggestionRules,

  ...rootApiSuggestionRules.map(
    (rule): JsonSuggestionRule => ({
      ...rule,
      path: [null, ...rule.path],
    }),
  ),
];