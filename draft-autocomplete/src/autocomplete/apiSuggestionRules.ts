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
        contextWeight: 3,
      },
      {
        kind: "property",
        id: "property-path",
        label: "path",
        description: "Endpoint path, for example /users.",
        priority: 9,
        propertyName: "path",
        contextWeight: 2,
      },
      {
        kind: "property",
        id: "property-description",
        label: "description",
        description: "What the operation does.",
        priority: 8,
        propertyName: "description",
        contextWeight: 0,
      },
      {
        kind: "property",
        id: "property-errors",
        label: "errors",
        description: "Possible error messages.",
        priority: 7,
        propertyName: "errors",
        contextWeight: 0,
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
    when: [
      { property: "method", equals: "GET" },
    ],
    suggestions: [
      {
        kind: "value",
        id: "description-get-list",
        label: "Returns a list of available resources.",
        description: "Suggested because method is GET.",
        priority: 10,
        value: "Returns a list of available resources.",
      },
      {
        kind: "value",
        id: "description-get-details",
        label: "Returns details of the specified resource.",
        description: "Suggested because method is GET.",
        priority: 9,
        value: "Returns details of the specified resource.",
      },
    ],
  },
  {
    kind: "value",
    path: ["description"],
    when: [
      { property: "method", equals: "POST" },
    ],
    suggestions: [
      {
        kind: "value",
        id: "description-post-create",
        label: "Creates a new resource.",
        description: "Suggested because method is POST.",
        priority: 10,
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