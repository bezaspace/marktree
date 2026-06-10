import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface CommentRange {
  id: string;
  from: number;
  to: number;
  resolved: boolean;
}

export interface CommentHighlightOptions {
  ranges: CommentRange[];
}

export const CommentHighlight = Extension.create<CommentHighlightOptions>({
  name: "commentHighlight",

  addOptions() {
    return {
      ranges: [],
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("commentHighlight"),
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => {
            set = set.map(tr.mapping, tr.doc);
            // Rebuild decorations from meta if provided
            const ranges: CommentRange[] | undefined = tr.getMeta("commentRanges");
            if (ranges) {
              const decorations = ranges
                .filter((r) => r.from >= 0 && r.to <= tr.doc.content.size && r.from < r.to)
                .map((r) =>
                  Decoration.inline(r.from, r.to, {
                    class: r.resolved
                      ? "comment-highlight-resolved"
                      : "comment-highlight",
                    "data-comment-id": r.id,
                  })
                );
              return DecorationSet.create(tr.doc, decorations);
            }
            return set;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
