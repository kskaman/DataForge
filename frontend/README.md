# DataForge Frontend

The React client supports single and schema-aware batch conversions. API requests include the server-issued `HttpOnly` guest cookie, so recent history is isolated to the current browser without a login or localStorage token.

Uploaded sources are removed after successful processing. Results and history expire 24 hours after creation. Clearing site cookies starts a new anonymous history, and the previous history cannot be recovered in version 1.

## Structure

- `App.tsx` composes the page and owns navigation/global errors.
- `hooks/useActivityFeed.ts` polls jobs, batches, and health and exposes activity actions.
- `features/conversion/` owns file selection, analysis, and output configuration.
- `features/activity/ActivityTable.tsx` renders job and batch history.
- `components/` contains shared page-level UI.
- `utils/` contains display-only helpers.

See [`../docs/WORKFLOWS.md`](../docs/WORKFLOWS.md) for Mermaid diagrams of each frontend and backend workflow.