import { useState, useEffect, useCallback } from "react";
import { useSession } from "../lib/auth-client.js";

export interface CommentItem {
  id: string;
  documentId: string;
  authorId: string;
  content: string;
  resolved: boolean;
  parentId: string | null;
  anchorFrom: number | null;
  anchorTo: number | null;
  yjsRelPosStart: string | null;
  yjsRelPosEnd: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string | null;
  replies?: CommentItem[];
}

interface CommentSidebarProps {
  documentId: string | null;
  selectedRange: { from: number; to: number } | null;
  yjsRelPosStart: string | null;
  yjsRelPosEnd: string | null;
  onClearSelection: () => void;
  onHighlightComment: (comment: CommentItem | null) => void;
  onCommentsChange?: () => void;
}

export function CommentSidebar({
  documentId,
  selectedRange,
  yjsRelPosStart,
  yjsRelPosEnd,
  onClearSelection,
  onHighlightComment,
  onCommentsChange,
}: CommentSidebarProps) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [filter, setFilter] = useState<"all" | "unresolved">("all");

  const fetchComments = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    const res = await fetch(`/api/comments/document/${documentId}`, {
      credentials: "include",
    });
    if (res.ok) {
      setComments(await res.json());
    }
    setLoading(false);
  }, [documentId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  async function submitComment() {
    if (!newComment.trim() || !documentId) return;
    await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        documentId,
        content: newComment,
        anchorFrom: selectedRange?.from ?? null,
        anchorTo: selectedRange?.to ?? null,
        yjsRelPosStart,
        yjsRelPosEnd,
      }),
    });
    setNewComment("");
    onClearSelection();
    await fetchComments();
    onCommentsChange?.();
  }

  async function submitReply(parentId: string) {
    if (!replyContent.trim() || !documentId) return;
    await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        documentId,
        content: replyContent,
        parentId,
      }),
    });
    setReplyContent("");
    setReplyingTo(null);
    await fetchComments();
    onCommentsChange?.();
  }

  async function resolveComment(id: string, resolved: boolean) {
    await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ resolved: !resolved }),
    });
    fetchComments();
  }

  async function deleteComment(id: string) {
    if (!confirm("Delete this comment?")) return;
    await fetch(`/api/comments/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    fetchComments();
  }

  const filteredComments =
    filter === "unresolved"
      ? comments.filter((c) => !c.resolved)
      : comments;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="w-80 border-l bg-gray-50 flex flex-col h-full">
      <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
        <h3 className="font-semibold text-sm">Comments</h3>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setFilter("all")}
            className={`px-2 py-0.5 rounded ${
              filter === "all" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("unresolved")}
            className={`px-2 py-0.5 rounded ${
              filter === "unresolved"
                ? "bg-blue-100 text-blue-700"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            Open
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <p className="text-gray-500 text-sm text-center py-4">Loading...</p>
        ) : filteredComments.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">
            {filter === "unresolved"
              ? "No open comments"
              : "No comments yet. Select text to add one."}
          </p>
        ) : (
          filteredComments.map((c) => (
            <div
              key={c.id}
              className={`bg-white rounded-lg border p-3 text-sm transition-shadow ${
                c.resolved ? "opacity-60" : ""
              }`}
              onMouseEnter={() => onHighlightComment(c)}
              onMouseLeave={() => onHighlightComment(null)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-xs">{c.authorName || "Unknown"}</span>
                <span className="text-xs text-gray-400">{formatDate(c.createdAt)}</span>
              </div>
              <p className="text-gray-700 mb-2 whitespace-pre-wrap">{c.content}</p>
              {c.anchorFrom !== null && c.anchorTo !== null && (
                <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                  anchored
                </span>
              )}
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => resolveComment(c.id, c.resolved)}
                  className={`text-xs px-2 py-0.5 rounded ${
                    c.resolved
                      ? "text-green-700 bg-green-50"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {c.resolved ? "Resolved" : "Resolve"}
                </button>
                <button
                  onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Reply
                </button>
                {c.authorId === session?.user?.id && (
                  <button
                    onClick={() => deleteComment(c.id)}
                    className="text-xs text-red-500 hover:underline ml-auto"
                  >
                    Delete
                  </button>
                )}
              </div>

              {/* Replies */}
              {c.replies && c.replies.length > 0 && (
                <div className="mt-2 pl-3 border-l-2 border-gray-200 space-y-2">
                  {c.replies.map((r) => (
                    <div key={r.id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.authorName || "Unknown"}</span>
                        <span className="text-gray-400">{formatDate(r.createdAt)}</span>
                      </div>
                      <p className="text-gray-700 mt-0.5">{r.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply input */}
              {replyingTo === c.id && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitReply(c.id);
                    }}
                    placeholder="Write a reply..."
                    className="flex-1 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <button
                    onClick={() => submitReply(c.id)}
                    className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
                  >
                    Send
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* New comment box */}
      <div className="p-3 border-t bg-white">
        {selectedRange ? (
          <div className="space-y-2">
            <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded flex items-center justify-between">
              <span>Comment on selected text</span>
              <button onClick={onClearSelection} className="text-gray-400 hover:text-gray-600">
                &times;
              </button>
            </div>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.metaKey) submitComment();
              }}
              placeholder="Add a comment..."
              rows={2}
              className="w-full text-sm border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              autoFocus
            />
            <button
              onClick={submitComment}
              disabled={!newComment.trim()}
              className="w-full text-xs bg-blue-600 text-white py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Comment
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center py-1">
            Select text in the document to add a comment
          </p>
        )}
      </div>
    </div>
  );
}
