import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// import { runJsonContextChecks } from "./autocomplete/getJsonContext.checks";
// runJsonContextChecks();
// import { runJsonInsertionChecks } from "./autocomplete/insertJsonSuggestion.checks";
// runJsonInsertionChecks();
// import { runJsonSuggestionsChecks } from "./autocomplete/jsonSuggestions.checks";
// runJsonSuggestionsChecks();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
