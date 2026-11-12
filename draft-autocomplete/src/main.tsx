import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { runJsonContextChecks } from "./autocomplete/tests/getJsonContext.checks.ts";
runJsonContextChecks();
import { runJsonInsertionChecks } from "./autocomplete/tests/insertJsonSuggestion.checks";
runJsonInsertionChecks();
import { runJsonSuggestionsChecks } from "./autocomplete/tests/jsonSuggestions.checks";
runJsonSuggestionsChecks();
import { runConfigurationChecks } from "./autocomplete/tests/configuration.checks";
runConfigurationChecks();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
