import { useState, useEffect, useRef, useCallback } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string;
}

interface AIChatSidebarProps {
  documentId: string | null;
  documentTitle: string;
  documentContent?: string;
  treeStructure?: string;
  selectedText?: string | null;
  onInsertText?: (text: string) => void;
  onReplaceSelection?: (text: string) => void;
  triggerCommand?: string | null;
}

export function AIChatSidebar({
  documentId,
  documentTitle,
  documentContent,
  treeStructure,
  selectedText,
  onInsertText,
  onReplaceSelection,
  triggerCommand,
}: AIChatSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load persisted messages when document changes
  useEffect(() => {
    if (!documentId) {
      setMessages([]);
      return;
    }
    fetchMessages(documentId);
  }, [documentId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-send slash command when triggered
  useEffect(() => {
    if (triggerCommand && documentId) {
      sendMessage(triggerCommand, { isSlashCommand: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerCommand]);

  async function fetchMessages(docId: string) {
    try {
      const res = await fetch(`/api/ai/messages/${docId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMessages(
          data.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
          }))
        );
      }
    } catch {
      // ignore
    }
  }

  async function clearHistory() {
    if (!documentId) return;
    if (!confirm("Clear AI chat history for this document?")) return;
    await fetch(`/api/ai/messages/${documentId}`, { method: "DELETE", credentials: "include" });
    setMessages([]);
  }

  const sendMessage = useCallback(
    async (text: string, options?: { isSlashCommand?: boolean; isInline?: boolean }) => {
      if (!documentId || !text.trim() || loading) return;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);
      setError(null);

      abortRef.current = new AbortController();

      try {
        const endpoint = options?.isSlashCommand
          ? "/api/ai/slash"
          : options?.isInline
          ? "/api/ai/inline"
          : "/api/ai/chat";

        const body: any = {
          documentId,
          context: {
            documentTitle,
            documentContent: documentContent || "",
            treeStructure: treeStructure || "",
            selectedText: selectedText || undefined,
          },
        };

        if (options?.isSlashCommand) {
          body.command = text.replace(/^\//, "").split(" ")[0];
        } else if (options?.isInline) {
          body.selectedText = selectedText || "";
          body.instruction = text;
        } else {
          body.messages = [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          }));
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
          signal: abortRef.current.signal,
        });

        if (!res.ok || !res.body) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let assistantText = "";
        const assistantId = `a-${Date.now()}`;

        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "" },
        ]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n").filter((l) => l.trim());

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]") continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.type === "text" && data.content) {
                assistantText += data.content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: assistantText } : m
                  )
                );
              } else if (data.type === "error") {
                throw new Error(data.error || "Stream error");
              }
            } catch {
              // ignore malformed lines
            }
          }
        }
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setError(err.message || "Failed to get AI response");
      } finally {
        setLoading(false);
        abortRef.current = null;
      }
    },
    [documentId, documentTitle, documentContent, treeStructure, selectedText, loading, messages]
  );

  function stopGeneration() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  return (
    <div className="w-80 border-l bg-gray-50 flex flex-col h-full">
      <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
        <h3 className="font-semibold text-sm">AI Assistant</h3>
        <div className="flex gap-1">
          <button
            onClick={clearHistory}
            className="text-xs text-gray-500 hover:text-red-600 px-2 py-0.5 rounded hover:bg-gray-100"
            title="Clear history"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="text-gray-400 text-sm text-center py-8 space-y-2">
            <p>Ask me anything about this document.</p>
            <p className="text-xs">
              Try: "Summarize this", "Expand the intro", or "Fix grammar"
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`text-sm ${
              msg.role === "user" ? "ml-4" : "mr-4"
            }`}
          >
            <div
              className={`rounded-lg p-2.5 whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-blue-100 text-blue-900"
                  : "bg-white border text-gray-800"
              }`}
            >
              {msg.content || (msg.role === "assistant" && loading ? (
                <span className="inline-flex items-center gap-1 text-gray-400">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              ) : null)}
            </div>

            {msg.role === "assistant" && msg.content && (
              <div className="flex gap-2 mt-1 ml-0.5">
                <button
                  onClick={() => copyToClipboard(msg.content)}
                  className="text-[10px] text-gray-500 hover:text-blue-600"
                >
                  Copy
                </button>
                {onInsertText && (
                  <button
                    onClick={() => onInsertText(msg.content)}
                    className="text-[10px] text-gray-500 hover:text-blue-600"
                  >
                    Insert
                  </button>
                )}
                {onReplaceSelection && selectedText && (
                  <button
                    onClick={() => onReplaceSelection(msg.content)}
                    className="text-[10px] text-gray-500 hover:text-blue-600"
                  >
                    Replace
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {error && (
          <div className="text-xs text-red-600 bg-red-50 rounded p-2">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t bg-white">
        {selectedText && (
          <div className="text-[10px] text-gray-500 mb-1.5 truncate bg-gray-100 rounded px-2 py-1">
            Context: {selectedText.slice(0, 60)}
            {selectedText.length > 60 ? "..." : ""}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AI..."
            disabled={loading}
            className="flex-1 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
          />
          {loading ? (
            <button
              type="button"
              onClick={stopGeneration}
              className="px-3 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
