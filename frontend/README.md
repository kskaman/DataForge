# DataForge Frontend

The React client supports single and schema-aware batch conversions. API requests include the server-issued `HttpOnly` guest cookie, so recent history is isolated to the current browser without a login or localStorage token.

Uploaded sources are removed after successful processing. Results and history expire 24 hours after creation. Clearing site cookies starts a new anonymous history, and the previous history cannot be recovered in version 1.

## Structure

- `App.tsx` composes the page and owns navigation/global errors.
- `hooks/useActivityFeed.ts` adaptively polls the combined activity endpoint and exposes activity actions.
- `features/conversion/` owns file selection, analysis, and output configuration.
- `features/activity/ActivityTable.tsx` renders job and batch history.
- `components/` contains shared page-level UI.
- `utils/` contains display-only helpers.

## Environment

`src/config.ts` is the only frontend module that reads `import.meta.env`. `VITE_API_URL` is optional: leave it empty when Vite or the production reverse proxy serves `/api` from the same origin. Set it to the API base URL only when the browser must call a separate origin.

Copy `.env.example` to `.env` for local overrides. Frontend `.env` variants are ignored by Git. Every `VITE_*` value is embedded into browser assets at build time, so never place `GUEST_SESSION_SECRET`, `DOWNLOAD_SECRET`, credentials, or any other secret in the frontend environment.

See [`../docs/WORKFLOWS.md`](../docs/WORKFLOWS.md) for Mermaid diagrams of each frontend and backend workflow.
