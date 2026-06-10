import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useSession, signOut } from "../lib/auth-client.js";
import { Editor } from "../components/Editor.js";

interface TreeNode {
  id: string;
  name: string;
  type: "folder" | "document";
  parentId: string | null;
  path: string;
}

interface DocumentData {
  id: string;
  treeNodeId: string;
  title: string;
  currentContent: string | null;
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
        setSelectedDoc(doc);
      }
    }
    setNewDocName("");
    fetchNodes();
  }

  async function openDocument(node: TreeNode) {
    const res = await fetch(`/api/documents?treeNodeId=${node.id}`, {
      credentials: "include",
    });
    if (res.ok) {
      const docs = await res.json();
      if (docs.length > 0) {
        setSelectedDoc(docs[0]);
      }
    }
  }

  async function saveDocument(content: string) {
    if (!selectedDoc) return;
    await fetch(`/api/documents/${selectedDoc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content }),
    });
    setSelectedDoc((d) => (d ? { ...d, currentContent: content } : null));
  }

  function buildTree(parentId: string | null): TreeNode[] {
    return nodes
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  function renderTree(parentId: string | null, depth = 0): React.ReactNode {
    const children = buildTree(parentId);
    return children.map((node) => (
      <div key={node.id} style={{ paddingLeft: depth * 12 }}>
        {node.type === "folder" ? (
          <div className="flex items-center gap-1 py-1 text-gray-700">
            <span className="text-gray-400">&#9654;</span>
            <span className="font-medium">{node.name}</span>
          </div>
        ) : (
          <button
            onClick={() => openDocument(node)}
            className={`flex items-center gap-1 py-1 w-full text-left hover:bg-gray-100 rounded px-1 ${
              selectedDoc?.treeNodeId === node.id ? "bg-blue-50 text-blue-700" : "text-gray-700"
            }`}
          >
            <span className="text-gray-400 text-sm">&#9635;</span>
            <span>{node.name}</span>
          </button>
        )}
        {renderTree(node.id, depth + 1)}
      </div>
    ));
  }

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
          <span className="text-sm text-gray-600">{session?.user?.email}</span>
          <button onClick={() => signOut()} className="text-sm text-red-600 hover:text-red-700">
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-gray-50 border-r overflow-y-auto p-4 flex flex-col">
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
              className="w-full text-sm border rounded px-2 py-1 mt-1"
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

          <div className="flex-1 overflow-y-auto">
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Files</h3>
            {renderTree(null)}
          </div>
        </aside>

        {/* Editor */}
        <main className="flex-1 overflow-y-auto bg-white">
          {selectedDoc ? (
            <div className="h-full flex flex-col">
              <div className="border-b px-6 py-3 flex items-center justify-between">
                <h2 className="font-semibold">{selectedDoc.title}</h2>
                <span className="text-xs text-gray-500">Press Ctrl+S to save</span>
              </div>
              <div className="flex-1 p-6">
                <Editor
                  content={selectedDoc.currentContent || ""}
                  onSave={saveDocument}
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400">
              Select a document to start editing
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
