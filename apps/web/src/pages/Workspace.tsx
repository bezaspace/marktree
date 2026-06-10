import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSession, signOut } from "../lib/auth-client.js";
import { Editor } from "../components/Editor.js";
import { CommentSidebar, type CommentItem } from "../components/CommentSidebar.js";
import { AIChatSidebar } from "../components/AIChatSidebar.js";
import { NotificationBell } from "../components/NotificationBell.js";
import * as Y from "yjs";
import { MarktreeProvider } from "../lib/yjs-provider.js";
import type { CommentRange } from "../components/comment-highlight.js";

interface TreeNode {
  id: string;
  name: string;
  type: "folder" | "document";
  parentId: string | null;
  path: string;
  sortOrder: number;
}

interface DocumentData {
  id: string;
  treeNodeId: string;
  title: string;
  currentContent: string | null;
}

interface HistoryEntry {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

export default function Workspace() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data: session } = useSession();
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentData | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newDocName, setNewDocName] = useState("");
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [diff, setDiff] = useState<string>("");
  const [diffFrom, setDiffFrom] = useState("");
  const [diffTo, setDiffTo] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [docContent, setDocContent] = useState<string>("");

  // Phase 4: Comments state
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [selectedCommentRange, setSelectedCommentRange] = useState<{ from: number; to: number } | null>(null);
  const [yjsRelPosStart, setYjsRelPosStart] = useState<string | null>(null);
  const [yjsRelPosEnd, setYjsRelPosEnd] = useState<string | null>(null);
  const [commentRanges, setCommentRanges] = useState<CommentRange[]>([]);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);

  // Phase 5: AI state
  const [aiOpen, setAiOpen] = useState(false);
  const [selectedTextForAI, setSelectedTextForAI] = useState<string | null>(null);
  const [triggerCommand, setTriggerCommand] = useState<string | null>(null);

  const yDocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<MarktreeProvider | null>(null);

  const fetchNodes = useCallback(async () => {
    if (!workspaceId) return;
    const res = await fetch(`/api/tree-nodes?workspaceId=${workspaceId}`, {
      credentials: "include",
    });
    if (res.ok) {
      setNodes(await res.json());
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  // Cleanup Yjs on doc change / unmount
  useEffect(() => {
    return () => {
      providerRef.current?.destroy();
      yDocRef.current = null;
      providerRef.current = null;
    };
  }, []);

  // Poll comments periodically when document is open
  useEffect(() => {
    if (!selectedDoc || !commentsOpen) return;
    const interval = setInterval(fetchComments, 5000);
    return () => clearInterval(interval);
  }, [selectedDoc, commentsOpen]);

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName || !workspaceId) return;
    await fetch("/api/tree-nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        workspaceId,
        parentId: selectedParentId,
        name: newFolderName,
        type: "folder",
      }),
    });
    setNewFolderName("");
    fetchNodes();
  }

  async function createDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!newDocName || !workspaceId) return;
    const res = await fetch("/api/tree-nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        workspaceId,
        parentId: selectedParentId,
        name: newDocName,
        type: "document",
      }),
    });
    if (res.ok) {
      const node: TreeNode = await res.json();
      const docRes = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ treeNodeId: node.id, title: newDocName }),
      });
      if (docRes.ok) {
        const doc: DocumentData = await docRes.json();
        await openDocumentById(doc.id);
      }
    }
    setNewDocName("");
    fetchNodes();
  }

  async function openDocumentById(docId: string) {
    providerRef.current?.destroy();
    yDocRef.current = null;
    providerRef.current = null;

    const res = await fetch(`/api/documents/${docId}`, { credentials: "include" });
    if (!res.ok) return;
    const doc: DocumentData = await res.json();
    setSelectedDoc(doc);
    setDocContent(doc.currentContent ?? "");

    const ydoc = new Y.Doc();
    yDocRef.current = ydoc;
    const wsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws?documentId=${doc.id}`;
    const provider = new MarktreeProvider(ydoc, wsUrl);
    providerRef.current = provider;

    // Load comments for this document
    await fetchComments(docId);
  }

  async function fetchComments(docId?: string) {
    const id = docId || selectedDoc?.id;
    if (!id) return;
    const res = await fetch(`/api/comments/document/${id}`, { credentials: "include" });
    if (res.ok) {
      const data: CommentItem[] = await res.json();
      setComments(data);
      // Map comments to highlight ranges
      const ranges: CommentRange[] = data
        .filter((c) => c.anchorFrom !== null && c.anchorTo !== null)
        .map((c) => ({
          id: c.id,
          from: c.anchorFrom!,
          to: c.anchorTo!,
          resolved: c.resolved,
        }));
      setCommentRanges(ranges);
    }
  }

  async function openDocument(node: TreeNode) {
    const res = await fetch(`/api/documents?treeNodeId=${node.id}`, {
      credentials: "include",
    });
    if (res.ok) {
      const docs = await res.json();
      if (docs.length > 0) {
        await openDocumentById(docs[0].id);
      }
    }
  }

  async function saveDocument() {
    if (!selectedDoc) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${selectedDoc.id}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: docContent }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Saved! Commit: ${data.commitHash.slice(0, 7)}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteNode(node: TreeNode) {
    if (!confirm(`Delete "${node.name}"?`)) return;
    await fetch(`/api/tree-nodes/${node.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (selectedDoc?.treeNodeId === node.id) {
      setSelectedDoc(null);
      providerRef.current?.destroy();
      yDocRef.current = null;
      providerRef.current = null;
    }
    fetchNodes();
  }

  async function renameNode(node: TreeNode) {
    if (!editName.trim() || editName === node.name) {
      setEditingNodeId(null);
      return;
    }
    await fetch(`/api/tree-nodes/${node.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: editName }),
    });
    setEditingNodeId(null);
    fetchNodes();
  }

  function toggleFolder(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function loadHistory() {
    if (!selectedDoc) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    const res = await fetch(`/api/documents/${selectedDoc.id}/history`, {
      credentials: "include",
    });
    if (res.ok) {
      setHistory(await res.json());
    }
    setHistoryLoading(false);
  }

  async function loadDiff() {
    if (!selectedDoc || !diffFrom || !diffTo) return;
    const res = await fetch(
      `/api/documents/${selectedDoc.id}/diff?from=${diffFrom}&to=${diffTo}`,
      { credentials: "include" }
    );
    if (res.ok) {
      const data = await res.json();
      setDiff(data.diff);
    }
  }

  async function restoreVersion(commitHash: string) {
    if (!selectedDoc) return;
    if (!confirm("Restore this version? This will overwrite your current document.")) return;
    const res = await fetch(
      `/api/documents/${selectedDoc.id}/content-at?commit=${commitHash}`,
      { credentials: "include" }
    );
    if (res.ok) {
      const data = await res.json();
      setDocContent(data.content);
      setSelectedDoc((d) => (d ? { ...d, currentContent: data.content } : null));
      setHistoryOpen(false);
      await openDocumentById(selectedDoc.id);
    }
  }

  function handleSelectionForComment(
    range: { from: number; to: number } | null,
    relStart: string | null,
    relEnd: string | null
  ) {
    setSelectedCommentRange(range);
    setYjsRelPosStart(relStart);
    setYjsRelPosEnd(relEnd);
    if (range) setCommentsOpen(true);
  }

  function handleClearSelection() {
    setSelectedCommentRange(null);
    setYjsRelPosStart(null);
    setYjsRelPosEnd(null);
  }

  function handleHighlightComment(comment: CommentItem | null) {
    setHighlightedCommentId(comment?.id || null);
  }

  // Phase 5: AI handlers
  function handleSelectionForAI(text: string) {
    setSelectedTextForAI(text);
    setAiOpen(true);
    setTriggerCommand(null);
  }

  function handleSlashCommand(command: string) {
    setAiOpen(true);
    setTriggerCommand(`/${command}`);
  }

  function handleInsertText(text: string) {
    // Insert at end of document (simplified)
    // In a real implementation we'd use the editor's current cursor position
    alert("Insert at cursor not yet implemented. Text copied to clipboard instead.");
    navigator.clipboard.writeText(text);
  }

  function handleReplaceSelection(text: string) {
    alert("Replace selection not yet implemented. Text copied to clipboard instead.");
    navigator.clipboard.writeText(text);
  }

  function buildTreeStructure(): string {
    const lines: string[] = [];
    function walk(parentId: string | null, depth: number) {
      nodes
        .filter((n) => n.parentId === parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .forEach((n) => {
          lines.push(`${"  ".repeat(depth)}- ${n.name}`);
          if (n.type === "folder") walk(n.id, depth + 1);
        });
    }
    walk(null, 0);
    return lines.join("\n");
  }

  function buildTree(parentId: string | null): TreeNode[] {
    return nodes
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((n) => {
        if (!search) return true;
        return n.name.toLowerCase().includes(search.toLowerCase());
      });
  }

  function renderTree(parentId: string | null, depth = 0): JSX.Element[] {
    return buildTree(parentId).map((node) => {
      const isExpanded = expanded.has(node.id) || !!search;
      return (
        <div key={node.id} style={{ paddingLeft: depth * 12 }}>
          {node.type === "folder" ? (
            <div className="flex items-center gap-1 py-1 group">
              <button
                onClick={() => toggleFolder(node.id)}
                className="text-gray-400 text-sm w-4 text-center hover:text-gray-600"
              >
                {isExpanded ? "\u25BC" : "\u25B6"}
              </button>
              {editingNodeId === node.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => renameNode(node)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") renameNode(node);
                    if (e.key === "Escape") setEditingNodeId(null);
                  }}
                  className="flex-1 text-sm border rounded px-1 py-0.5"
                />
              ) : (
                <span
                  className="font-medium cursor-pointer flex-1"
                  onDoubleClick={() => {
                    setEditingNodeId(node.id);
                    setEditName(node.name);
                  }}
                >
                  {node.name}
                </span>
              )}
              <button
                onClick={() => deleteNode(node)}
                className="opacity-0 group-hover:opacity-100 text-red-500 text-xs px-1"
                title="Delete"
              >
                x
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 py-1 group">
              <span className="text-gray-400 text-sm w-4 text-center">&#9646;</span>
              {editingNodeId === node.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => renameNode(node)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") renameNode(node);
                    if (e.key === "Escape") setEditingNodeId(null);
                  }}
                  className="flex-1 text-sm border rounded px-1 py-0.5"
                />
              ) : (
                <button
                  onClick={() => openDocument(node)}
                  className={`flex-1 text-left hover:bg-gray-100 rounded px-1 ${
                    selectedDoc?.treeNodeId === node.id ? "bg-blue-50 text-blue-700" : "text-gray-700"
                  }`}
                  onDoubleClick={() => {
                    setEditingNodeId(node.id);
                    setEditName(node.name);
                  }}
                >
                  {node.name}
                </button>
              )}
              <button
                onClick={() => deleteNode(node)}
                className="opacity-0 group-hover:opacity-100 text-red-500 text-xs px-1"
                title="Delete"
              >
                x
              </button>
            </div>
          )}
          {(node.type === "folder" && (isExpanded || search)) && renderTree(node.id, depth + 1)}
        </div>
      );
    });
  }

  const breadcrumbPath = selectedDoc
    ? nodes.find((n) => n.id === selectedDoc.treeNodeId)?.path || selectedDoc.title
    : "";

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold">Marktree</h1>
          <button onClick={() => navigate("/workspaces")} className="text-sm text-gray-600 hover:text-gray-900">
            &larr; Back to workspaces
          </button>
        </div>
        <div className="flex items-center gap-4">
          <NotificationBell />
          <span className="text-sm text-gray-600">{session?.user?.email}</span>
          <button onClick={() => signOut()} className="text-sm text-red-600 hover:text-red-700">
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 bg-gray-50 border-r overflow-y-auto p-4 flex flex-col shrink-0">
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">New Item</h3>
            <form onSubmit={createFolder} className="mb-2">
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="flex-1 text-sm border rounded px-2 py-1"
                />
                <button type="submit" className="text-xs bg-gray-200 px-2 rounded hover:bg-gray-300">
                  +F
                </button>
              </div>
            </form>
            <form onSubmit={createDocument}>
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder="Document name"
                  value={newDocName}
                  onChange={(e) => setNewDocName(e.target.value)}
                  className="flex-1 text-sm border rounded px-2 py-1"
                />
                <button type="submit" className="text-xs bg-blue-100 text-blue-700 px-2 rounded hover:bg-blue-200">
                  +D
                </button>
              </div>
            </form>
          </div>

          <div className="mb-2">
            <label className="text-xs text-gray-500">Parent folder</label>
            <select
              value={selectedParentId || ""}
              onChange={(e) => setSelectedParentId(e.target.value || null)}
              className="w-full text-sm border rounded px-2 py-1 mt-1 bg-white"
            >
              <option value="">Root</option>
              {nodes
                .filter((n) => n.type === "folder")
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="mb-2">
            <input
              type="text"
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm border rounded px-2 py-1"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Files</h3>
            {renderTree(null)}
          </div>
        </aside>

        {/* Editor */}
        <main className="flex-1 overflow-hidden bg-white flex flex-col">
          {selectedDoc ? (
            <>
              <div className="border-b px-6 py-3 flex items-center justify-between shrink-0">
                <div className="min-w-0">
                  <h2 className="font-semibold truncate">{selectedDoc.title}</h2>
                  <p className="text-xs text-gray-500 truncate">{breadcrumbPath}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setAiOpen(!aiOpen)}
                    className={`text-sm border rounded px-2 py-1 ${
                      aiOpen ? "bg-purple-50 text-purple-700 border-purple-200" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    AI
                  </button>
                  <button
                    onClick={() => setCommentsOpen(!commentsOpen)}
                    className={`text-sm border rounded px-2 py-1 ${
                      commentsOpen ? "bg-blue-50 text-blue-700 border-blue-200" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Comments {commentRanges.length > 0 && `(${commentRanges.length})`}
                  </button>
                  <button
                    onClick={loadHistory}
                    className="text-sm text-gray-600 hover:text-gray-900 border rounded px-2 py-1"
                  >
                    History
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {yDocRef.current && providerRef.current && selectedDoc && (
                  <Editor
                    key={selectedDoc.id}
                    yDoc={yDocRef.current}
                    provider={providerRef.current}
                    initialContent={selectedDoc.currentContent}
                    onSave={saveDocument}
                    saving={saving}
                    onContentChange={setDocContent}
                    onSelectionForComment={handleSelectionForComment}
                    onSelectionForAI={handleSelectionForAI}
                    onSlashCommand={handleSlashCommand}
                    commentRanges={commentRanges}
                    highlightedCommentId={highlightedCommentId}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              Select a document to start editing
            </div>
          )}
        </main>

        {/* AI Sidebar */}
        {aiOpen && selectedDoc && (
          <AIChatSidebar
            documentId={selectedDoc.id}
            documentTitle={selectedDoc.title}
            documentContent={docContent}
            treeStructure={buildTreeStructure()}
            selectedText={selectedTextForAI}
            onInsertText={handleInsertText}
            onReplaceSelection={handleReplaceSelection}
            triggerCommand={triggerCommand}
          />
        )}

        {/* Comment Sidebar */}
        {commentsOpen && selectedDoc && (
          <CommentSidebar
            documentId={selectedDoc.id}
            selectedRange={selectedCommentRange}
            yjsRelPosStart={yjsRelPosStart}
            yjsRelPosEnd={yjsRelPosEnd}
            onClearSelection={handleClearSelection}
            onHighlightComment={handleHighlightComment}
            onCommentsChange={() => {
              if (selectedDoc) fetchComments(selectedDoc.id);
            }}
          />
        )}
      </div>

      {/* History Panel */}
      {historyOpen && (
        <div className="fixed inset-0 bg-black/30 flex justify-end z-50">
          <div className="w-96 bg-white h-full shadow-xl flex flex-col">
            <div className="border-b px-4 py-3 flex items-center justify-between">
              <h3 className="font-semibold">Version History</h3>
              <button onClick={() => setHistoryOpen(false)} className="text-gray-500 hover:text-gray-800">
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {historyLoading ? (
                <p className="text-gray-500 text-sm">Loading...</p>
              ) : history.length === 0 ? (
                <p className="text-gray-400 text-sm">No history yet. Save the document to create versions.</p>
              ) : (
                <div className="space-y-3">
                  {history.map((entry) => (
                    <div key={entry.hash} className="border rounded p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs bg-gray-100 px-1 rounded">{entry.hash.slice(0, 7)}</span>
                        <span className="text-xs text-gray-500">{entry.author}</span>
                      </div>
                      <p className="text-gray-700 text-xs mb-1">{entry.message}</p>
                      <p className="text-gray-400 text-[10px]">{new Date(entry.date).toLocaleString()}</p>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => restoreVersion(entry.hash)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => {
                            setDiffFrom(entry.hash);
                            setDiff("");
                          }}
                          className="text-xs text-gray-500 hover:underline"
                        >
                          {diffFrom === entry.hash ? "Selected" : "Diff from"}
                        </button>
                        {diffFrom && diffFrom !== entry.hash && (
                          <button
                            onClick={() => {
                              setDiffTo(entry.hash);
                              loadDiff();
                            }}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Diff to
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {diff && (
                    <div className="border rounded p-3 bg-gray-50">
                      <h4 className="text-xs font-semibold mb-2">Diff</h4>
                      <pre className="text-[10px] overflow-x-auto whitespace-pre-wrap font-mono text-gray-700">
                        {diff}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
