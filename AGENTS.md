# Marktree Agent Notes

## Project Structure
- Monorepo with npm workspaces: `apps/web`, `apps/server`, `packages/shared`
- Frontend: React 18 + Vite + Tailwind CSS + React Router + TipTap
- Backend: Express + TypeScript + Drizzle ORM + Better Auth + `better-sqlite3`

## Development Commands

### Start everything
```bash
# Terminal 1 — backend
cd apps/server && npm run dev

# Terminal 2 — frontend
cd apps/web && npm run dev
```

### Install dependencies (from root)
```bash
npm install --legacy-peer-deps
```

### Type check
```bash
cd apps/server && npm run typecheck
cd apps/web && npm run typecheck
```

## Auth
- Uses **Better Auth** with built-in Kysely adapter + `better-sqlite3`
- Auth tables (`user`, `session`, `account`, `verification`) use **camelCase** column names
- Domain tables (`workspace`, `tree_node`, `document`, `yjs_update`) use snake_case, managed by Drizzle ORM
- Both coexist in the same SQLite file (`apps/server/data/marktree.db`)
- Frontend auth client: `apps/web/src/lib/auth-client.ts` using `better-auth/react`

## Environment Variables (apps/server/.env)
- `DATABASE_URL` — SQLite file path (default: `./data/marktree.db`)
- `BETTER_AUTH_SECRET` — Must be >=32 chars
- `BETTER_AUTH_URL` — Backend base URL
- `FRONTEND_URL` — CORS origin
- `GIT_REPOS_DIR` — Where Git bare repos live
- `PORT` — Server port (default 3000)

## Known Gotchas
1. **Better Auth table columns must be camelCase** — The Kysely adapter queries columns like `emailVerified`, `createdAt`. Using snake_case causes "no such column" errors.
2. **npm workspaces + peer deps** — Use `npm install --legacy-peer-deps` when installing to avoid peer dependency conflicts with `better-auth`.
3. **Drizzle-orm version** — Better Auth has a peerOptional on `drizzle-orm ^0.45.2` but `0.36.x` works in practice with `--legacy-peer-deps`.
4. **Better Auth built-in adapter does NOT auto-create tables** — Our `initDatabase()` in `apps/server/src/db/init.ts` manually creates them on startup.

## API Routes
- `/api/auth/*` — Better Auth endpoints (register, login, logout, session)
- `/api/workspaces` — Workspace CRUD
- `/api/tree-nodes?workspaceId=...` — Folder/document tree CRUD
- `/api/documents` — Document CRUD + `?treeNodeId=...` for listing
- `/api/health` — Health check
