/**
 * TagMark.ts
 *
 * A TipTap Mark extension that renders tagged text as a coloured highlight.
 * Each mark stores the tag's UUID and category colour so highlights are
 * visually distinct per category.
 *
 * The mark is applied programmatically (not via keyboard shortcuts) and
 * rendered as a <mark> element with inline styles.
 */

import { Mark, mergeAttributes } from '@tiptap/core';

export interface TagMarkAttributes {
  tagUuid: string;
  categoryId: string;
  color: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tagMark: {
      /**
       * Apply a tag mark to the current selection.
       */
      setTagMark: (attrs: TagMarkAttributes) => ReturnType;
      /**
       * Remove a tag mark by UUID from the entire document.
       */
      unsetTagMarkByUuid: (tagUuid: string) => ReturnType;
    };
  }
}

export const TagMark = Mark.create<Record<string, never>>({
  name: 'tagMark',

  // Allow marks to span across multiple nodes
  spanning: false,

  // Keep the mark even when content changes (we prevent editing anyway)
  keepOnSplit: false,

  addAttributes() {
    return {
      tagUuid: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-tag-uuid'),
        renderHTML: (attrs) => ({ 'data-tag-uuid': attrs.tagUuid }),
      },
      categoryId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-category-id'),
        renderHTML: (attrs) => ({ 'data-category-id': attrs.categoryId }),
      },
      color: {
        default: '#3b82f6',
        parseHTML: (el) => el.getAttribute('data-color'),
        renderHTML: (attrs) => ({ 'data-color': attrs.color }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'mark[data-tag-uuid]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const color: string = HTMLAttributes['data-color'] ?? '#3b82f6';
    // Convert hex to rgba for a translucent highlight
    const bg = hexToRgba(color, 0.25);
    const border = hexToRgba(color, 0.7);

    return [
      'mark',
      mergeAttributes(HTMLAttributes, {
        class: 'tag-mark',
        style: `background-color: ${bg}; border-bottom: 2px solid ${border}; color: inherit;`,
      }),
    ];
  },

  addCommands() {
    return {
      setTagMark:
        (attrs: TagMarkAttributes) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs);
        },

      unsetTagMarkByUuid:
        (tagUuid: string) =>
        ({ tr, state, dispatch }) => {
          const { doc } = state;
          let found = false;

          doc.descendants((node, pos) => {
            if (!node.isText) return;
            const mark = node.marks.find(
              (m) =>
                m.type.name === 'tagMark' &&
                m.attrs.tagUuid === tagUuid
            );
            if (mark) {
              found = true;
              tr.removeMark(pos, pos + node.nodeSize, mark.type);
            }
          });

          if (found && dispatch) {
            dispatch(tr);
          }
          return found;
        },
    };
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(59,130,246,${alpha})`;
  return `rgba(${r},${g},${b},${alpha})`;
}
