# Trello Desktop MCP — Developer Guide

## Architecture

This project has **two separate entrypoints** that must both be kept in sync:

| File | Purpose | Compiles to |
|------|---------|-------------|
| `src/index.ts` | **Claude Desktop entrypoint** — standalone server with credential injection from env vars | `dist/index.js` |
| `src/server.ts` | MCP server factory (`createMCPServer()`) for other integrations | `dist/server.js` |

Claude Desktop runs `dist/index.js` directly. `src/server.ts` is a separate abstraction that is **not** used by Claude Desktop. Changes to one do not affect the other.

### Source layout

```
src/
  index.ts          ← Claude Desktop entrypoint (MUST be updated for every new tool)
  server.ts         ← MCP server factory (MUST be updated for every new tool)
  trello/
    client.ts       ← All Trello REST API calls
  tools/
    boards.ts       ← Board/list read tools
    cards.ts        ← Card CRUD tools
    lists.ts        ← List cards / create list / add comment
    members.ts      ← Member lookup tools
    search.ts       ← Search tool
    advanced.ts     ← Bulk read tools (board cards, card actions, attachments, checklists)
    checklists.ts   ← Checklist & check-item CRUD tools
  types/
    trello.ts       ← Shared TypeScript types
  utils/
    validation.ts   ← Zod schemas and validate* helpers
    logger.ts
    appInsights.ts
    health.ts
```

## Adding a New Tool — Checklist

Every new tool requires changes in **four places**. Miss any one and the tool will be missing in Claude Desktop.

### 1. `src/trello/client.ts` — add the API call

Follow the existing pattern: use `this.makeRequest<T>()` with the appropriate HTTP method and endpoint.

- Query parameters go in `params: Record<string, string>` (they are appended to the URL along with auth).
- Request bodies go in `body: JSON.stringify(...)`.
- Return type is `Promise<TrelloApiResponse<T>>`.

```ts
async doSomething(id: string, data: { name: string }): Promise<TrelloApiResponse<Something>> {
  return this.makeRequest<Something>(
    `/endpoint/${id}`,
    { method: 'POST', body: JSON.stringify(data) },
    `Do something on ${id}`
  );
}
```

### 2. `src/tools/<feature>.ts` — define the tool and handler

Each tool file exports two things per tool:

- A `const xyzTool: Tool` object with `name`, `description`, and `inputSchema`.
- An `async function handleXyz(args: unknown)` that validates, calls the client, and returns an MCP content response.

Use inline Zod schemas for validation (see `advanced.ts` for the pattern) or export named schemas via `validation.ts` (see `cards.ts`).

The handler always returns one of:

```ts
// Success
return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };

// Error
return { content: [{ type: 'text' as const, text: `Error doing X: ${errorMessage}` }], isError: true };
```

### 3. `src/server.ts` — register the tool

Three places inside this file:

```ts
// a) Import at the top
import { xyzTool, handleXyz } from './tools/feature.js';

// b) Add to the tools array in ListToolsRequestSchema handler
xyzTool,

// c) Add a case to the CallToolRequestSchema switch
case 'xyz_tool_name':
  return await handleXyz(args);
```

### 4. `src/index.ts` — register the tool (Claude Desktop) ← EASY TO MISS

Exactly the same three changes as `server.ts`, but `index.ts` uses `argsWithCredentials` instead of `args` in the switch (credentials are injected from env vars):

```ts
// a) Import at the top
import { xyzTool, handleXyz } from './tools/feature.js';

// b) Add to the tools array in ListToolsRequestSchema handler
xyzTool,

// c) Add a case to the CallToolRequestSchema switch
case 'xyz_tool_name':
  result = await handleXyz(argsWithCredentials);
  break;
```

Note: `index.ts` uses `result = ...` + `break` (not `return await ...`), because the result is returned after the switch block.

## Build & Test

```bash
npm run build        # compile src/ → dist/
npm run type-check   # type-check without emitting
npm run rebuild      # clean + build
```

After building, restart the Trello MCP server in Claude Desktop (Settings → Developer → MCP Servers) for changes to take effect.

## Conventions

- Tool names use `snake_case` prefixed with `trello_` (e.g. `trello_create_checklist`).
- All tool inputs require `apiKey` and `token` fields (Claude Desktop auto-injects these).
- Trello IDs are 24-character hex strings — validate with `/^[a-f0-9]{24}$/`.
- All client methods that accept optional fields use explicit `if (x !== undefined)` guards rather than spreading, so `undefined` values are never serialised to the API.
