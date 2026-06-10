# Marktree Architecture

## What This Document Is

This is the **system design document**. It explains how the system is structured, how data flows, and how major components interact. It does not define what features exist — that belongs in `Marktree-Complete-Feature-Specification.md`. It does not define the build order — that belongs in `roadmap.md`. It does not record decisions already made — that belongs in `progress.md`.

## How to Update This Document

- **Add subsystems** when a new technical component is introduced (e.g., adding a vector database for AI search).
- **Modify flows** when the implementation changes from what was originally planned (log the change and date in `progress.md`).
- **Never duplicate** feature lists from the spec. Describe the *technical machinery* that enables the feature.

---

## System Overview

```
┌─────────────┐     HTTP/WS      ┌─────────────────────────────────────┐
│   React     │◄────────────────►│  Node.js + Express Backend          │
│  (TipTap)   │                  │  ┌─────────┐ ┌─────────┐ ┌────────┐ │
│   (Yjs)     │                  │  │ SQLite  │ │  Yjs    │ │  Git   │ │
│             │                  │  │(metadata│ │(realtime│ │(history│ │
└─────────────┘                  │  │  store) │ │  store) │ │ store) │ │
                                 │  └─────────┘ └─────────┘ └────────┘ │
                                 └─────────────────────────────────────┘
```

- **Frontend:** React 18 + Vite + TipTap editor + Yjs client
- **Backend:** Node.js + Express + TypeScript
- **Realtime:** WebSocket (`ws` library) + Yjs server-side document store
- **Metadata:** SQLite (users, workspaces, folders, document metadata)
- **History:** One Git bare repository per workspace (stores Markdown as files)

---

## Data Model

### SQLite Entities

| Entity | Key Fields | Purpose |
|---|---|---|
| `User` | `id`, `name`, `email`, `emailVerified`, `image`, `createdAt`, `updatedAt` | Authentication (managed by Better Auth) |
| `Workspace` | `id`, `name`, `owner_id`, `git_repo_path` | Team container + Git repo location |
| `WorkspaceMember` | `workspace_id`, `user_id`, `role` | RBAC (Owner, Admin, Editor, Viewer) |
| `TreeNode` | `id`, `workspace_id`, `parent_id`, `name`, `type` (folder/doc), `path`, `sort_order` | Folder tree structure |
| `Document` | `id`, `tree_node_id`, `current_content` (latest Yjs snapshot as Markdown), `last_modified_at` | Document metadata + fast read |
| `YjsUpdate` | `id`, `document_id`, `update_blob`, `created_at` | Append-only log of Yjs updates for persistence |

### Git Storage

- One **bare Git repository** per workspace, stored on disk at a configured path.
- The Git tree mirrors the `TreeNode` folder structure.
- Each Markdown file name = `TreeNode.name + ".md"`.
- Commits are created only on **explicit manual save** or **checkpoint action**.
- Commit author = `User.display_name <User.email>`.
- Commit message = auto-generated (e.g., `Update "Meeting Notes" via web`) or custom if provided.

---

## Persistence Strategy

### Document Content (The Dual-Write)

1. **Real-time layer:** Yjs handles live editing. Client Yjs updates are sent over WebSocket to the server. The server applies them to an in-memory Yjs `Y.Doc` and persists the raw Yjs update blob to `YjsUpdate` table (append-only).
2. **Readable layer:** The server periodically (or on explicit save) converts the Yjs document to Markdown and writes it to `Document.current_content` (SQLite) and to the Git working tree, then creates a Git commit.

**Why two layers?** Yjs binary updates are required for real-time sync. Markdown is required for Git history and human readability. SQLite `current_content` is required for fast document listing and search without reconstructing from Yjs history.

### Folder Structure

- The `TreeNode` table is the **source of truth** for the folder tree.
- Git tree structure is derived from `TreeNode` when a commit is made.
- If a folder is renamed, `TreeNode` is updated immediately in SQLite. The Git tree is updated on the next commit.

---

## Key Flows

### Flow: User Opens a Document

1. Client requests document metadata via REST API.
2. Server returns `Document` row + latest Yjs state vector.
3. Client initializes Yjs `Y.Doc` with the state vector.
4. Client joins WebSocket room for that `document_id`.
5. Server streams any missed Yjs updates since the client's state vector.

### Flow: User Edits a Document (Real-Time)

1. User types in TipTap.
2. TipTap emits Yjs update.
3. Client sends update over WebSocket.
4. Server applies update to in-memory `Y.Doc` and appends raw update to `YjsUpdate` table.
5. Server broadcasts update to all other clients in the room.

### Flow: User Hits Save (Checkpoint)

1. Client sends `save` event over WebSocket or HTTP POST.
2. Server converts in-memory Yjs `Y.Doc` to Markdown string.
3. Server writes Markdown to Git working tree at the correct path (derived from `TreeNode`).
4. Server creates Git commit with author metadata.
5. Server updates `Document.current_content` and `last_modified_at` in SQLite.
6. Server returns commit hash to client.

### Flow: User Views Version History

1. Client requests history for a document.
2. Server runs `git log -- <path>` inside the workspace's bare repository.
3. Server returns list of commits (hash, author, date, message).
4. For a diff, server runs `git diff <hashA> <hashB> -- <path>` and returns the diff.

---

## Tech Stack & Rationale

| Layer | Choice | Why |
|---|---|---|
| Monorepo | npm workspaces | Shared types between frontend and backend. Turborepo can be adopted later for caching. |
| Frontend Framework | React 18 + Vite | Fast dev server, modern bundling |
| Editor | TipTap (ProseMirror) | Structured document model, excellent Markdown support, Yjs plugin exists |
| Real-Time | Yjs + `ws` | Yjs is the standard CRDT for collaborative text. `ws` is lightweight; Socket.io is unnecessary since Yjs handles its own protocol |
| Backend | Node.js 20 + Express + TypeScript | Familiar stack, good SQLite/Git ecosystem |
| Database | SQLite | Single-file, zero-config, sufficient for metadata at this scale. Can migrate to Postgres later without changing the data model |
| Versioning | Git (bare repos) | Proven, diff/blame/restore are free. One repo per workspace isolates history |
| Auth | Better Auth (built-in Kysely adapter + `better-sqlite3`) | Framework-agnostic, provides email/password, sessions, rate limiting, social login ready. Auth tables use camelCase columns. Domain tables use Drizzle ORM. Both share one SQLite file. |

---

## Deployment Notes

- **Single-node deployment:** The simplest path is a single Docker container or VPS running Node.js, with SQLite and Git repos on a persistent volume.
- **Scaling limitation:** SQLite is not suited for multi-node deployments. If horizontal scaling becomes necessary, SQLite must be replaced with Postgres, but the data model remains the same.
- **Git repo storage:** Git bare repos live on disk. Backups = copy the directory. No special tooling needed.
