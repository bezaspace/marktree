# Marktree Roadmap

## What This Document Is

This is the **development plan**. It defines what to build, in what order, and what is out of scope. It does not explain *how* features work — that belongs in `ARCHITECTURE.md`. It does not list every feature in detail — that belongs in `Marktree-Complete-Feature-Specification.md`. It does not track what was built — that belongs in `progress.md`.

## How to Update This Document

- **Add phases** only when they are approved for development.
- **Move items** between MVP and Post-MVP only after a decision is logged in `progress.md`.
- **Mark phases complete** when they meet their Definition of Done (record the date in `progress.md`).
- **Never duplicate** feature descriptions from the spec. Reference the spec by section number.

---

## MVP (Minimum Viable Product)

The smallest set of features that makes Marktree usable by a single team. Everything listed here is mandatory for v1.0.0.

| # | Phase | What It Covers | Depends On |
|---|---|---|---|
| 1 | Foundation | Auth, workspace management, folder tree, single-user Markdown editor, basic persistence | None |
| 2 | Real-Time Collaboration | Yjs sync for multi-user editing on the same document | Phase 1 |
| 3 | Version Control | Git-backed manual checkpoints, per-document history, diff/restore | Phase 1 |

### MVP Details

**Phase 1: Foundation — COMPLETED (2026-06-10)**
- From spec: Sections 1.1–1.5 (Project Setup, Auth, Workspace, Folder Tree, Editor)
- Excluded from MVP: Guest users (1.2), drag-and-drop reordering (1.4), optimistic locking on folder tree (deferred to Phase 2)
- Definition of Done: A single user can register, create a workspace, add nested folders, create Markdown documents, edit with TipTap, and reload the page to see persisted content.

**Phase 2: Real-Time Collaboration — COMPLETED (2026-06-10)**
- From spec: Section 2.1–2.4 (Yjs Integration, WebSocket, Conflict Resolution)
- Excluded from MVP: Cursor presence (2.3), user activity status, document locking (2.5)
- Definition of Done: Two users can open the same document and see each other's edits in real-time without data loss.

**Phase 3: Version Control — COMPLETED (2026-06-10)**
- From spec: Sections 3.1–3.2 (Git Integration, Document-Level History)
- Excluded from MVP: Tree-level snapshots (3.3), blame (3.4), commit management UI (3.5), branching/merging
- Definition of Done: Every manual save creates a Git commit. Users can view a document's version timeline, diff any two versions, and restore to a previous version.

---

## Post-MVP Phases

These are ordered by priority but may shift based on user feedback. Do not start these until MVP is complete.

| Priority | Phase | From Spec |
|---|---|---|
| 4 | Comments & Review | Phase 4 (inline comments, basic notifications) |
| 5 | AI Integration | Phase 5 (sidebar chat, inline editing, slash commands) |
| 6 | Advanced Features | Phase 6 (wiki-links, full-text search, tags, templates, import/export) |
| 7 | CLI & Agent Integration | Phase 7 (marktree CLI, local sync) |
| 8 | Polish & Scale | Phase 8 (performance, mobile, accessibility, security hardening, admin/billing) |

---

## Out of Scope (v1.0.0)

These are explicitly not part of the current plan. If a requirement arises, it must be approved and logged in `progress.md`.

- Offline PWA / offline-first editing
- Mobile native apps (mobile web is Post-MVP)
- Plugin/extension ecosystem
- Non-Markdown file types (images are attachments only; no .docx, .pdf editing)
- Tree-level branching and merging (Phase 3.3 — may be simplified to Git branches)
- Real-time cursor presence and activity status (Phase 2.3)
- Guest/anonymous user access (Phase 1.2)
- Billing and subscription management (Phase 8.5)
