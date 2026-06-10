# Marktree: Complete Feature Specification

## Project Overview

Marktree is an open-source, web-based Markdown workspace for teams. It combines Google Docs-style real-time collaboration with Git-powered version control, tree-level folder versioning, and AI-assisted editing. Every document is pure Markdown. Humans and AI agents collaborate in the same space.

**Tech Stack:** Node.js + Express (backend), React + TipTap (frontend), Yjs (real-time collaboration), Git (versioning), SQLite (metadata), WebSocket (sync).

---

## Phase 1: Foundation

### 1.1 Project Setup & Infrastructure

- Initialize monorepo structure (apps/web, apps/server, packages/shared)
- Set up Node.js 20+ backend with Express and TypeScript
- Set up React 18+ frontend with Vite and TypeScript
- Configure ESLint, Prettier, and TypeScript strict mode
- Set up SQLite database with migrations system
- Configure environment variables and config management
- Set up development scripts (concurrent dev servers)
- Create basic CI/CD pipeline (GitHub Actions for lint, type-check, test)

### 1.2 User Authentication & Authorization

- User registration with email and password
- User login with JWT token generation
- JWT refresh token mechanism
- Password hashing with bcrypt
- Logout and token invalidation
- Guest/anonymous user support (optional temporary access)
- Basic user profile (display name, avatar)
- Session management and expiry

### 1.3 Workspace Management

- Create a new workspace (team/organization container)
- Workspace settings (name, description, icon)
- Invite users to workspace by email
- User roles: Owner, Admin, Editor, Viewer
- Role-based permissions enforcement
- List user's workspaces
- Switch between workspaces
- Workspace deletion (soft delete)

### 1.4 Basic Folder & File Structure

- Create folders (nested, unlimited depth)
- Rename folders
- Delete folders (with confirmation)
- Create Markdown documents
- Rename documents
- Delete documents
- Drag-and-drop folder/document reordering
- Breadcrumb navigation
- Collapsible folder tree sidebar
- Folder tree search/filter
- Optimistic locking for folder/document structure changes (rename, move, delete) to prevent overwriting concurrent tree modifications

### 1.5 Markdown Editor (Single User)

- TipTap-based Markdown editor
- Live preview mode (split view: editor + rendered preview)
- Markdown syntax highlighting in editor
- Support for standard Markdown: headings, lists, links, images, code blocks, tables, blockquotes, horizontal rules
- Support for GitHub Flavored Markdown: task lists, strikethrough, autolinks
- Frontmatter YAML support (metadata at top of document)
- Keyboard shortcuts (bold, italic, headings, etc.)
- Manual save (Ctrl+S or save button) persists document and creates a versioned checkpoint
- Document status indicator (saved, saving, unsaved changes)

### 1.6 Basic Document Persistence

- Save document content to database
- Document metadata storage (title, path, created_at, updated_at, author)
- Document listing API
- Document retrieval API
- Document update API
- Document deletion API

---

## Phase 2: Real-Time Collaboration

### 2.1 Yjs Integration

- Integrate Yjs CRDT into TipTap editor
- Yjs document synchronization over WebSocket
- Server-side Yjs document store (in-memory with persistence)
- Document loading from Yjs state
- Document state persistence to disk/SQLite
- Handle multiple users editing the same document

### 2.2 WebSocket Infrastructure

- WebSocket server with Socket.io or ws library
- Room-based document sessions
- User connection and disconnection handling
- Heartbeat/ping-pong for connection health
- Reconnection logic with state recovery
- Broadcast document updates to all connected users

### 2.3 Collaborative Presence

- Display other users' cursors in real-time
- Show user names next to cursors
- Cursor colors per user
- User selection highlighting (show what text others have selected)
- Active users list in document sidebar
- User activity status (typing, idle, away)
- Presence awareness in folder tree (who's viewing what)

### 2.4 Conflict Resolution

- Automatic CRDT-based conflict merging
- No "last write wins" — all edits preserved
- Handle offline edits and sync on reconnection
- Visual conflict indicators (rare edge cases)
- Manual conflict resolution UI (if CRDT cannot resolve)

### 2.5 Document Locking (Optional)

- Soft lock: indicate someone is editing a section
- Hard lock: prevent editing a section (configurable per workspace)
- Lock timeout and release

---

## Phase 3: Version Control & History

### 3.1 Git Integration

- Initialize Git bare repository per workspace
- Manual save or explicit checkpoint action creates a Git commit
- Commit metadata: author, timestamp, message (auto-generated)
- Document content stored as Markdown files in Git
- Git tree structure mirrors folder structure

### 3.2 Document-Level Version History

- View all versions of a document
- Version timeline with timestamps and authors
- Diff view between any two versions
- Side-by-side diff (added/removed highlighted)
- Inline diff (within document view)
- Restore document to any previous version
- Version comparison selector

### 3.3 Tree-Level Version History (Unique Feature)

- Snapshot entire folder tree at any point in time
- Browse historical tree states
- Tree snapshot timeline
- Visual tree diff: show which files changed, were added, or deleted between two snapshots
- Compare two tree snapshots side-by-side
- Restore entire folder tree to a snapshot
- Branch a document tree (create parallel version)
- Merge tree branches
- Tag snapshots (e.g., "v1.0 release", "Q4 planning")

### 3.4 Blame & Attribution

- Git blame per line (who last edited each line)
- Blame view toggle in editor
- Hover to see edit details (author, time, commit message)
- Per-document contributor statistics

### 3.5 Commit Management

- Commit on manual save with auto-generated message
- Manual commit with custom message
- Commit history browser
- Commit search by message, author, or date
- Revert specific commits
- Cherry-pick commits between branches

---

## Phase 4: Comments & Review

### 4.1 Inline Comments

- Select text range → add comment
- Comment anchored to text (survives edits via position mapping)
- Threaded replies to comments
- Resolve/unresolve comments
- Comment status indicators (open, resolved)
- Comment sidebar with all comments on document
- Comment filtering (show only unresolved, by author, etc.)
- Email/notification on new comments

### 4.2 Suggestion Mode

- Toggle suggestion mode per document
- Suggestions appear as tracked changes (like Google Docs)
- Visual diff for suggestions (highlighted additions/deletions)
- Accept or reject individual suggestions
- Accept all/reject all suggestions
- Suggestion attribution (who suggested)
- Comment on suggestions

### 4.3 @Mentions

- Type @ to mention users in comments
- Mentioned users get notifications
- Click mention to see user profile
- Mention autocomplete with user search

### 4.4 Notifications

- In-app notification center
- Notification types: comment, mention, document shared, version restored
- Mark notifications as read
- Notification preferences per user
- Email notifications (optional, configurable)

---

## Phase 5: AI Integration

### 5.1 AI Chat Sidebar

- Collapsible AI chat sidebar in document view
- Start new conversation per document
- Multi-turn chat history
- Context-aware: AI knows current document content, selection, and folder structure
- Streaming responses (SSE)
- Copy AI response to clipboard
- Insert AI response into document

### 5.2 Inline AI Editing (No Ghost Text)

- Select text → click "Ask AI" or press `Cmd+K`
- AI sidebar opens with selection as context
- User types instruction: "Make this more formal", "Expand this section", "Simplify"
- AI generates rewritten text in chat
- User clicks "Replace" to swap selected text
- User clicks "Insert below" to add after selection
- User clicks "Copy" to manually paste
- Support for multiple AI providers (OpenAI, Anthropic, local via Ollama)

### 5.3 Slash Commands

- Type `/` in editor to open command palette
- Commands: `/summarize`, `/expand`, `/simplify`, `/fix-grammar`, `/translate`, `/generate-toc`
- Each command sends context to AI and returns result in chat sidebar
- Custom slash commands (user-defined prompts)

### 5.4 AI Document Actions

- AI-generated document summary
- AI-generated table of contents
- AI tag suggestions based on content
- AI-related document suggestions
- AI-full-text search enhancement (semantic search)

### 5.5 AI Agent Attribution

- Track AI-generated edits separately from human edits
- Show AI icon next to AI-suggested changes
- Filter history by human vs AI edits
- AI usage analytics per workspace

### 5.6 AI Configuration

- Workspace-level AI provider settings (API keys, model selection)
- User-level AI preferences
- Support for multiple models (GPT-4, Claude, local models)
- Rate limiting and quota management
- Cost tracking per workspace

---

## Phase 6: Advanced Features

### 6.1 Wiki-Links & Knowledge Graph

- `[[Page Name]]` syntax for internal links
- Autocomplete for wiki-links
- Backlinks panel (show which documents link to current one)
- Broken link detection
- Knowledge graph visualization (nodes = documents, edges = links)
- Graph navigation (click node to open document)

### 6.2 Full-Text Search

- Global search across all documents in workspace
- Search by title, content, or tags
- Fuzzy search with relevance ranking
- Search filters (folder, author, date range)
- Search result highlighting
- Saved searches
- Recent searches

### 6.3 Tags & Metadata

- Add tags to documents (YAML frontmatter)
- Tag autocomplete and management
- Filter documents by tags
- Tag cloud view
- Custom metadata fields (configurable per workspace)

### 6.4 Templates

- Create document templates
- Template gallery (built-in + custom)
- Templates for: meeting notes, PRDs, ADRs, runbooks, blog posts
- Use template when creating new document
- Template variables (auto-fill date, author, etc.)

### 6.5 Import & Export

- Import Markdown files from ZIP
- Import from GitHub repository
- Export workspace as ZIP of Markdown files
- Export single document as Markdown
- Export as PDF (via pandoc or similar)
- Export as HTML
- Bulk import/export

### 6.6 Book Mode / Publishing

- Collect documents into a "book" or collection
- Ordered document list with drag-and-drop
- Table of contents generation
- Published view (clean, read-only)
- Share book via public link
- Custom styling for published books
- Export book as static site

---

## Phase 7: CLI & Agent Integration

### 7.1 CLI Tool

- `marktree` CLI installed via npm
- `marktree login` — authenticate with workspace
- `marktree init` — initialize local workspace sync
- `marktree pull` — download documents to local folder
- `marktree push` — upload local changes
- `marktree sync` — two-way sync
- `marktree create <path>` — create document
- `marktree edit <path>` — open in default editor
- `marktree delete <path>` — delete document
- `marktree status` — show sync status
- `marktree history <path>` — show document history
- `marktree restore <path> <commit>` — restore version



### 7.2 Local Sync

- Bidirectional sync between local Markdown files and Marktree
- Watch local folder for changes (fs.watch or chokidar)
- Auto-sync on file change
- Conflict resolution when local and remote diverge
- `.marktreeignore` file (like .gitignore)
- Sync status indicators

---

## Phase 8: Polish & Scale

### 8.1 Performance Optimization

- Virtualized folder tree (react-window)
- Lazy document loading
- Editor virtualization for large documents
- Image lazy loading
- Bundle code splitting
- API response caching
- Database query optimization
- Connection pooling

### 8.2 Mobile Responsiveness

- Responsive sidebar (collapsible on mobile)
- Touch-friendly editor toolbar
- Mobile-optimized comment view
- Bottom sheet for AI chat on mobile
- Swipe gestures for navigation

### 8.3 Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigation throughout
- Screen reader support
- ARIA labels and roles
- Focus management
- Color contrast compliance
- Reduced motion support

### 8.4 Security Hardening

- Input sanitization
- XSS prevention
- CSRF protection
- Rate limiting on all endpoints
- Content Security Policy headers
- Secure WebSocket connections (WSS)
- Audit logging

### 8.5 Admin & Billing

- Workspace admin dashboard
- User management (invite, remove, change roles)
- Usage analytics (documents, edits, AI usage)
- Billing and subscription management
- Plan limits enforcement (storage, users, AI credits)
- Export workspace data (GDPR compliance)

---

## Feature Summary Table

| # | Feature Category | Key Capabilities |
|---|---|---|
| 1 | **Auth** | Registration, login, JWT, roles, invites |
| 2 | **Workspace** | Create, manage, invite, roles, switch |
| 3 | **Folder Tree** | Nested folders, drag-drop, breadcrumbs, search |
| 4 | **Editor** | TipTap Markdown, live preview, frontmatter, auto-save |
| 5 | **Real-Time Collab** | Yjs sync, cursors, presence, conflict resolution |
| 6 | **Git Versioning** | Auto-commits, history, diff, restore, blame |
| 7 | **Tree Versioning** | Folder snapshots, tree diff, branch, merge, tags |
| 8 | **Comments** | Inline comments, threads, resolve, notifications |
| 9 | **Suggestions** | Tracked changes, accept/reject, suggestion mode |
| 10 | **AI Chat** | Sidebar chat, context-aware, streaming |
| 11 | **Inline AI Edit** | Select + instruct AI, replace/insert/copy |
| 12 | **Slash Commands** | `/summarize`, `/expand`, custom commands |
| 13 | **Wiki-Links** | `[[Page]]`, backlinks, broken link detection |
| 14 | **Search** | Full-text, fuzzy, filters, saved searches |
| 15 | **Tags** | Add, filter, autocomplete, tag cloud |
| 16 | **Templates** | Built-in + custom, template gallery |
| 17 | **Import/Export** | ZIP, GitHub, PDF, HTML, Markdown |
| 18 | **Book Mode** | Collections, TOC, publish, share link |
| 19 | **CLI** | pull, push, sync, edit, history, restore |
| 20 | **Mobile** | Responsive, touch-friendly, bottom sheets |
| 21 | **Accessibility** | WCAG AA, keyboard nav, screen readers |
| 22 | **Security** | XSS, CSRF, CSP, rate limiting, audit logs |
