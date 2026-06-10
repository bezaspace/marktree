import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSession, signOut } from "../lib/auth-client.js";

interface Workspace {
  id: string;
  name: string;
  description: string | null;
}

export default function Workspaces() {
  const { data: session } = useSession();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch("/api/workspaces", { credentials: "include" })
      .then((r) => r.json())
      .then(setWorkspaces)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, description }),
    });
    if (res.ok) {
      const ws = await res.json();
      setWorkspaces([...workspaces, ws]);
      setName("");
      setDescription("");
    }
    setCreating(false);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Marktree</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{session?.user?.email}</span>
          <button
            onClick={() => signOut()}
            className="text-sm text-red-600 hover:text-red-700"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">Your Workspaces</h2>
          <p className="text-gray-600">Create or join a workspace to start collaborating.</p>
        </div>

        <form onSubmit={handleCreate} className="bg-white p-6 rounded-lg shadow-sm mb-8 border">
          <h3 className="font-semibold mb-4">Create New Workspace</h3>
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Workspace name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex-1 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={creating || !name}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </form>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : workspaces.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No workspaces yet. Create one above to get started.
          </div>
        ) : (
          <div className="grid gap-4">
            {workspaces.map((ws) => (
              <Link
                key={ws.id}
                to={`/workspaces/${ws.id}`}
                className="bg-white p-4 rounded-lg shadow-sm border hover:shadow-md transition-shadow"
              >
                <h3 className="font-semibold text-lg">{ws.name}</h3>
                {ws.description && (
                  <p className="text-gray-600 text-sm mt-1">{ws.description}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
