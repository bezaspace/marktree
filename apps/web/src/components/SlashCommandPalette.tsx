import { useState, useEffect, useRef } from "react";

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
}

const COMMANDS: SlashCommand[] = [
  { id: "summarize", label: "Summarize", description: "Create a concise summary", icon: "📝" },
  { id: "expand", label: "Expand", description: "Add detail and depth", icon: "📖" },
  { id: "simplify", label: "Simplify", description: "Make text easier to understand", icon: "✂️" },
  { id: "fix-grammar", label: "Fix Grammar", description: "Correct spelling and grammar", icon: "✏️" },
  { id: "translate", label: "Translate", description: "Translate or clarify text", icon: "🌐" },
  { id: "generate-toc", label: "Generate TOC", description: "Create a table of contents", icon: "📑" },
];

interface SlashCommandPaletteProps {
  editorRef: React.RefObject<HTMLDivElement>;
  editorView: any;
  onCommand: (command: string) => void;
  onClose: () => void;
}

export function SlashCommandPalette({ editorRef, editorView, onCommand, onClose }: SlashCommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Compute position from editor cursor
  useEffect(() => {
    if (!editorView) {
      onClose();
      return;
    }
    try {
      const rect = editorView.coordsAtPos(editorView.state.selection.from);
      const containerRect = editorRef.current?.getBoundingClientRect();
      if (rect && containerRect) {
        setPosition({
          top: rect.bottom - containerRect.top + 4,
          left: rect.left - containerRect.left,
        });
      }
    } catch {
      onClose();
    }
  }, [editorView, editorRef, onClose]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = query
    ? COMMANDS.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.description.toLowerCase().includes(query.toLowerCase())
      )
    : COMMANDS;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onCommand(filtered[selectedIndex].id);
      }
    } else if (e.key === "Backspace" && query === "") {
      e.preventDefault();
      onClose();
    }
  }

  if (!position) return null;

  return (
    <div
      className="absolute z-50 w-64 bg-white border rounded-lg shadow-lg overflow-hidden"
      style={{ top: position.top, left: position.left }}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full px-3 py-2 text-sm border-b outline-none"
        placeholder="Type a command..."
      />
      <div className="max-h-60 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-400">No commands found</div>
        ) : (
          filtered.map((cmd, idx) => (
            <button
              key={cmd.id}
              onClick={() => onCommand(cmd.id)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 text-sm hover:bg-gray-50 ${
                idx === selectedIndex ? "bg-blue-50" : ""
              }`}
            >
              <span className="text-base">{cmd.icon}</span>
              <div>
                <div className="font-medium">/{cmd.label}</div>
                <div className="text-xs text-gray-500">{cmd.description}</div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
