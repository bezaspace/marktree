# Marktree Progress

## What This Document Is

This is the **decision log and implementation journal**. It records what was built, when it was built, and why technical choices were made. It does not plan future work — that belongs in `roadmap.md`. It does not describe system design — that belongs in `ARCHITECTURE.md`. It does not list features — that belongs in `Marktree-Complete-Feature-Specification.md`.

## How to Update This Document

- **One entry per decision or milestone.** Use the format below.
- **Always include a date.** Use ISO 8601 (`YYYY-MM-DD`).
- **Link to related documents.** If a decision changes the architecture, reference `ARCHITECTURE.md`. If it reprioritizes a feature, reference `roadmap.md`.
- **Be specific.** "Chose library X" is better than "Did some backend work."
- **No speculative entries.** Do not write "Plan to do X next week." Only log what was actually done or decided.

---

## Status Summary

| Phase | Status | Date |
|---|---|---|
| Foundation | **Completed** | 2026-06-10 |
| Real-Time Collaboration | **Completed** | 2026-06-10 |
| Version Control | **Completed** | 2026-06-10 |

---

## Decision Log

### 2025-06-10 — Spec Review & Planning Documents Created

**What happened:**
- Reviewed `Marktree-Complete-Feature-Specification.md`.
- Identified and resolved two critical issues:
  1. **Auto-save Git commit time bomb:** Changed from auto-save every 2 seconds creating Git commits to manual save only. See spec sections 1.5, 3.1, 3.5.
  2. **Optimistic locking vs. CRDT conflict:** Removed optimistic locking from document content persistence (Yjs handles this). Moved it to folder tree structure changes only (rename, move, delete). See spec sections 1.4, 1.6, 2.4.

**Decisions made:**
- Git commits are created **only on explicit manual save or checkpoint action**, not on real-time edits.
- **Yjs (CRDTs)** is the sole conflict resolution mechanism for document text.
- **Optimistic locking** is used only for non-real-time metadata operations (folder tree changes).

**Impact:**
- Updated `Marktree-Complete-Feature-Specification.md`.
- Created `roadmap.md` (MVP definition, phase ordering, out-of-scope list).
- Created `ARCHITECTURE.md` (data model, persistence strategy, key flows, tech stack).
- Created `progress.md` (this document).

---

### 2026-06-10 — Phase 1: Foundation Implementation Complete

**What happened:**
- Scaffolded monorepo with `apps/web`, `apps/server`, and `packages/shared` using npm workspaces.
- Built backend: Express + TypeScript + Drizzle ORM + Better Auth + SQLite + `better-sqlite3`.
- Implemented REST APIs for workspaces, folder tree (tree_nodes), and documents with RBAC.
- Built frontend: React 18 + Vite + Tailwind CSS + React Router + TipTap editor.
- Auth flow works end-to-end: register, login, logout, session-based cookie auth.
- Verified: user can register, create a workspace, add nested folders and documents, edit in TipTap, save, and reload to see persisted content.

**Decisions made:**
- **Better Auth instead of hand-rolled JWT:** Better Auth provides email/password, session management, rate limiting, and future social login out of the box. It uses the built-in Kysely adapter with `better-sqlite3`. The auth tables (`user`, `session`, `account`, `verification`) use camelCase column names to match Kysely's default identifier mapping. Our domain tables (`workspace`, `tree_node`, `document`, `yjs_update`) use snake_case and are managed by Drizzle ORM. Both coexist in the same SQLite file.
- **npm workspaces over Turborepo:** Simpler zero-config setup. Can migrate to Turborepo later for caching without structural changes.
- **Drizzle ORM for domain tables:** Type-safe queries, schema defined in code, easy migration path to Postgres later.
- **TipTap StarterKit for Phase 1 editor:** Provides bold, italic, headings, lists, blockquotes, code blocks. Markdown serialization via `editor.getHTML()` for persistence. Full Markdown support with Markdown extension will come in Phase 2+.
- **Manual save only (Ctrl+S / Save button):** No auto-save Git commits. Document content is persisted to `document.current_content` on explicit save. This aligns with the earlier decision to avoid the "auto-save Git commit time bomb."

**Impact:**
- New files: entire `apps/server/src/`, `apps/web/src/`, `packages/shared/src/` trees.
- Updated `ARCHITECTURE.md` auth row to reflect Better Auth.
- Updated `roadmap.md` Phase 1 status to completed.
- `progress.md` updated with this entry.

---

### 2026-06-10 — Phase 2 & 3: Real-Time Collaboration and Version Control Implemented

**What happened:**
- Integrated Yjs CRDT into the TipTap editor via `@tiptap/extension-collaboration`.
- Built a custom WebSocket provider (`MarktreeProvider`) that connects to a server-side Yjs room manager.
- Server maintains in-memory `Y.Doc` per document, loads persisted updates from the `yjs_update` SQLite table on first access, and appends new updates in real time.
- Implemented room-based document sessions with Better Auth session validation over WebSocket upgrade requests.
- Added reconnection logic with a 2-second backoff and connection status indicators in the editor toolbar.
- Git integration: each workspace gets a normal (non-bare) Git repo initialized via `simple-git` on creation.
- Every manual save (`POST /api/documents/:id/save`) writes the document as a Markdown file into the workspace Git repo and creates a commit with author attribution.
- Added document-level version history endpoints: `/history`, `/diff`, and `/content-at`.
- Built a frontend version history panel with timeline, diff viewer, and restore functionality.
- Improved folder tree UI: collapsible folders, inline rename (double-click), delete with confirmation, search/filter, and breadcrumb navigation.
- Fixed tree-node deletion to cascade recursively (deletes all descendants and their associated documents).
- Server `tsconfig.json`: disabled declaration generation to resolve pre-existing `BetterSqlite3.Database` type-export errors.

**Decisions made:**
- **Custom lightweight WS provider instead of `y-websocket`:** Our server protocol is simpler (full state on connect + raw Yjs updates). It avoids the complexity of matching the full `y-websocket` server spec and integrates cleanly with our existing Express HTTP server and Better Auth cookie sessions.
- **Normal Git repos instead of bare repos:** `simple-git` can add/commit files in a working tree directly. A bare repo would require low-level Git object manipulation or `--work-tree` tricks. The `git_repo_path` schema field is unchanged.
- **Client-side Markdown generation for Git commits:** On explicit save, the client sends `editor.getHTML()` to the server, which writes it to the repo. True server-side Markdown conversion from Yjs would require a ProseMirror schema on the backend — deferred as a future enhancement.
- **Yjs update persistence is append-only:** The `yjs_update` table stores every individual Yjs update blob. Document state is reconstructed by applying all updates in order. This is robust and simple at the cost of unbounded table growth (compaction can be added later).

**Impact:**
- New files: `apps/server/src/websocket.ts`, `apps/server/src/lib/git.ts`, `apps/web/src/lib/yjs-provider.ts`.
- Modified: `apps/server/src/index.ts`, `apps/server/src/routes/documents.ts`, `apps/server/src/routes/treeNodes.ts`, `apps/server/src/routes/workspaces.ts`, `apps/server/tsconfig.json`, `apps/web/src/components/Editor.tsx`, `apps/web/src/pages/Workspace.tsx`.
- Updated `progress.md` and `roadmap.md`.

---

## Template for Future Entries

```markdown
### YYYY-MM-DD — [Short Title]

**What happened:**
[Description of what was implemented, fixed, or decided.]

**Decisions made:**
- [Decision 1 and rationale.]
- [Decision 2 and rationale.]

**Impact:**
- [Which files/code were changed?]
- [Which other documents need updating?]
```
