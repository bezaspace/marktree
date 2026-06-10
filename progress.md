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
| Real-Time Collaboration | Not started | — |
| Version Control | Not started | — |

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
