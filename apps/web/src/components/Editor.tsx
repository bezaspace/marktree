import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Collaboration from "@tiptap/extension-collaboration";
import { useEffect, useCallback } from "react";
import * as Y from "yjs";
import type { MarktreeProvider } from "../lib/yjs-provider.js";

interface EditorProps {
  yDoc: Y.Doc;
  provider: MarktreeProvider;
  initialContent?: string | null;
  onSave: () => void;
  saving?: boolean;
  onContentChange?: (content: string) => void;
}

export function Editor({ yDoc, provider, initialContent, onSave, saving, onContentChange }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,
      }),
      Placeholder.configure({ placeholder: "Start writing..." }),
      Collaboration.configure({
        document: yDoc,
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[60vh]",
      },
    },
    onUpdate: ({ editor }) => {
      onContentChange?.(editor.getHTML());
    },
  });

  // Populate initial content if Y.Doc is empty (first load from legacy current_content)
  useEffect(() => {
    if (!editor || !provider.initialized) return;
    // Check if doc is effectively empty (just a default empty paragraph)
    const fragment = yDoc.getXmlFragment("prosemirror");
    if (fragment.length === 0 && initialContent) {
      // Defer to avoid colliding with Collaboration init
      const t = setTimeout(() => {
        editor.commands.setContent(initialContent, false);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [editor, provider.initialized, yDoc, initialContent]);

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
    <div onKeyDown={handleSave} className="h-full flex flex-col">
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
      <EditorContent editor={editor} />
    </div>
  );
}
