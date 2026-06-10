import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Collaboration from "@tiptap/extension-collaboration";
import { useEffect, useCallback, useState, useRef } from "react";
import * as Y from "yjs";
import type { MarktreeProvider } from "../lib/yjs-provider.js";
import { CommentHighlight, type CommentRange } from "./comment-highlight.js";

interface EditorProps {
  yDoc: Y.Doc;
  provider: MarktreeProvider;
  initialContent?: string | null;
  onSave: () => void;
  saving?: boolean;
  onContentChange?: (content: string) => void;
  onSelectionForComment?: (range: { from: number; to: number } | null, relStart: string | null, relEnd: string | null) => void;
  commentRanges?: CommentRange[];
  highlightedCommentId?: string | null;
}

function encodeRelativePosition(relPos: any): string | null {
  try {
    const encoded = Y.encodeRelativePosition(relPos);
    let binary = "";
    for (let i = 0; i < encoded.length; i++) {
      binary += String.fromCharCode(encoded[i]);
    }
    return btoa(binary);
  } catch {
    return null;
  }
}

export function Editor({
  yDoc,
  provider,
  initialContent,
  onSave,
  saving,
  onContentChange,
  onSelectionForComment,
  commentRanges = [],
  highlightedCommentId,
}: EditorProps) {
  const [floatingPos, setFloatingPos] = useState<{ top: number; left: number } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,
      }),
      Placeholder.configure({ placeholder: "Start writing..." }),
      Collaboration.configure({
        document: yDoc,
      }),
      CommentHighlight.configure({ ranges: commentRanges }),
    ],
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[60vh]",
      },
      handleDOMEvents: {
        mouseup: (_view) => {
          // Let the selectionUpdate handler deal with it
          return false;
        },
      },
    },
    onUpdate: ({ editor }) => {
      onContentChange?.(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        setFloatingPos(null);
        onSelectionForComment?.(null, null, null);
        return;
      }

      // Compute floating toolbar position
      try {
        const domSel = window.getSelection();
        if (domSel && domSel.rangeCount > 0) {
          const rect = domSel.getRangeAt(0).getBoundingClientRect();
          const containerRect = editorRef.current?.getBoundingClientRect();
          if (containerRect) {
            setFloatingPos({
              top: rect.bottom - containerRect.top + 8,
              left: rect.left - containerRect.left + rect.width / 2 - 40,
            });
          }
        }
      } catch {
        setFloatingPos(null);
      }
    },
  });

  // Populate initial content if Y.Doc is empty
  useEffect(() => {
    if (!editor || !provider.initialized) return;
    const fragment = yDoc.getXmlFragment("prosemirror");
    if (fragment.length === 0 && initialContent) {
      const t = setTimeout(() => {
        editor.commands.setContent(initialContent, false);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [editor, provider.initialized, yDoc, initialContent]);

  // Update comment decorations
  useEffect(() => {
    if (!editor) return;
    const tr = editor.state.tr;
    tr.setMeta("commentRanges", commentRanges);
    editor.view.dispatch(tr);
  }, [editor, commentRanges]);

  // Highlight specific comment range
  useEffect(() => {
    if (!editor || !highlightedCommentId) return;
    const range = commentRanges.find((r) => r.id === highlightedCommentId);
    if (range) {
      try {
        editor.commands.setTextSelection({ from: range.from, to: range.to });
        const dom = editor.view.domAtPos(range.from);
        if (dom.node instanceof HTMLElement) {
          dom.node.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      } catch {
        // ignore
      }
    }
  }, [editor, highlightedCommentId, commentRanges]);

  const handleAddComment = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;

    let relStart: string | null = null;
    let relEnd: string | null = null;

    try {
      const yFragment = yDoc.getXmlFragment("prosemirror");
      // Create relative positions using Yjs native API on the fragment
      const relPosStart = Y.createRelativePositionFromTypeIndex(yFragment, from);
      const relPosEnd = Y.createRelativePositionFromTypeIndex(yFragment, to);
      relStart = encodeRelativePosition(relPosStart);
      relEnd = encodeRelativePosition(relPosEnd);
    } catch {
      // fallback to absolute positions only
    }

    onSelectionForComment?.({ from, to }, relStart, relEnd);
    setFloatingPos(null);
  }, [editor, yDoc, onSelectionForComment]);

  const handleSave = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        onSave();
      }
    },
    [onSave]
  );

  if (!editor) return null;

  return (
    <div ref={editorRef} onKeyDown={handleSave} className="h-full flex flex-col relative">
      <div className="flex gap-2 mb-4 border-b pb-2 items-center">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`px-2 py-1 rounded text-sm ${editor.isActive("bold") ? "bg-gray-200" : "hover:bg-gray-100"}`}
        >
          Bold
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`px-2 py-1 rounded text-sm ${editor.isActive("italic") ? "bg-gray-200" : "hover:bg-gray-100"}`}
        >
          Italic
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`px-2 py-1 rounded text-sm ${editor.isActive("heading", { level: 1 }) ? "bg-gray-200" : "hover:bg-gray-100"}`}
        >
          H1
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`px-2 py-1 rounded text-sm ${editor.isActive("heading", { level: 2 }) ? "bg-gray-200" : "hover:bg-gray-100"}`}
        >
          H2
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`px-2 py-1 rounded text-sm ${editor.isActive("bulletList") ? "bg-gray-200" : "hover:bg-gray-100"}`}
        >
          Bullet
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`px-2 py-1 rounded text-sm ${editor.isActive("orderedList") ? "bg-gray-200" : "hover:bg-gray-100"}`}
        >
          Numbered
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`px-2 py-1 rounded text-sm ${editor.isActive("blockquote") ? "bg-gray-200" : "hover:bg-gray-100"}`}
        >
          Quote
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          className={`px-2 py-1 rounded text-sm ${editor.isActive("codeBlock") ? "bg-gray-200" : "hover:bg-gray-100"}`}
        >
          Code
        </button>
        <div className="flex-1" />
        <span className="text-xs text-gray-500 mr-2">
          {provider.status === "connected"
            ? "Synced"
            : provider.status === "connecting"
            ? "Connecting..."
            : "Disconnected"}
        </span>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Floating comment button */}
      {floatingPos && (
        <div
          className="absolute z-20 bg-gray-900 text-white text-xs px-3 py-1.5 rounded shadow-lg cursor-pointer hover:bg-gray-800 transition-colors"
          style={{ top: floatingPos.top, left: floatingPos.left }}
          onClick={handleAddComment}
        >
          Add comment
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}
