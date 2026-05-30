/**
 * TagMark.ts
 *
 * A TipTap Mark extension that renders tagged text as a coloured highlight
 * and injects an inline badge widget at the start of each tagged region.
 *
 * The badge shows the category label (e.g. "TEMA: KATEGORI") in the
 * theme colour together with an × button to remove the tag directly
 * from the editor.
 *
 * The mark itself keeps a subtle background tint so the extent of the
 * tagged text is still visible after the badge.
 */

import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { useDocumentStore } from '../../store/useDocumentStore';

export interface TagMarkAttributes {
  tagUuid: string;
  categoryId: string;
  color: string;
  /** Human-readable label shown in the badge, e.g. "TEMA: KATEGORI" */
  label: string;
  canLinkGeometry?: boolean;
  linkGeometryLabel?: string;
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

  spanning: false,
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
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-label') ?? '',
        renderHTML: (attrs) => ({ 'data-label': attrs.label }),
      },
      canLinkGeometry: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-can-link-geometry') === 'true',
        renderHTML: (attrs) => ({
          'data-can-link-geometry': attrs.canLinkGeometry ? 'true' : 'false',
        }),
      },
      linkGeometryLabel: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-link-geometry-label') ?? '',
        renderHTML: (attrs) => ({ 'data-link-geometry-label': attrs.linkGeometryLabel }),
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
    // Keep a very subtle background tint so the text range is visible
    const bg = hexToRgba(color, 0.12);
    const border = hexToRgba(color, 0.5);

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

  // ── Inline badge decoration plugin ────────────────────────────────────────
  addProseMirrorPlugins() {
    // Capture editor reference for use inside the plugin closure
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey('tagMarkBadges'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            const { doc } = state;
            // Track UUIDs we've already placed a badge for (one badge per tag,
            // even if the mark spans multiple text nodes)
            const seen = new Set<string>();

            doc.descendants((node, pos) => {
              if (!node.isText) return;

              for (const mark of node.marks) {
                if (mark.type.name !== 'tagMark') continue;

                const uuid = mark.attrs.tagUuid as string;
                if (!uuid || seen.has(uuid)) continue;
                seen.add(uuid);

                const color: string = mark.attrs.color ?? '#3b82f6';
                const label: string = mark.attrs.label ?? '';
                const canLinkGeometry = mark.attrs.canLinkGeometry === true;
                const linkGeometryLabel: string = mark.attrs.linkGeometryLabel || 'Länka geometri';

                // ── Build badge DOM element ─────────────────────────────
                const badge = document.createElement('span');
                badge.className = 'tag-badge-widget';
                badge.setAttribute('data-tag-uuid', uuid);
                badge.setAttribute('tabindex', '0');
                badge.setAttribute('role', 'group');
                badge.setAttribute('aria-label', `Tagg ${label}`);
                badge.style.setProperty('--tag-color', color);
                badge.style.setProperty('--tag-bg', hexToRgba(color, 0.1));
                badge.style.setProperty('--tag-border', hexToRgba(color, 0.4));

                // Clicking the badge selects the tag
                badge.addEventListener('mousedown', (e) => {
                  // Only select if we're not clicking the close button
                  const target = e.target as HTMLElement;
                  if (!target.closest('.tag-badge-action')) {
                    e.preventDefault();
                    e.stopPropagation();
                    useDocumentStore.getState().selectTag(uuid);
                  }
                });

                const labelSpan = document.createElement('span');
                labelSpan.className = 'tag-badge-label';
                labelSpan.textContent = label.toUpperCase();

                const linkBtn = document.createElement('button');
                linkBtn.className = 'tag-badge-action tag-badge-link';
                linkBtn.setAttribute('type', 'button');
                linkBtn.setAttribute('aria-label', linkGeometryLabel);
                linkBtn.setAttribute('title', linkGeometryLabel);
                linkBtn.appendChild(createLinkIconSvg());

                linkBtn.addEventListener('mousedown', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const store = useDocumentStore.getState();
                  if (store.selectedTagUuid !== uuid) {
                    store.selectTag(uuid);
                  }
                  store.startLinking(uuid);
                });

                linkBtn.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                });

                const closeBtn = document.createElement('button');
                closeBtn.className = 'tag-badge-action tag-badge-close';
                closeBtn.setAttribute('type', 'button');
                closeBtn.setAttribute('aria-label', 'Ta bort tagg');
                closeBtn.setAttribute('title', 'Ta bort tagg');
                closeBtn.textContent = '×';

                // Use mousedown so we act before ProseMirror's own
                // mousedown selection logic fires
                closeBtn.addEventListener('mousedown', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Remove mark from editor
                  editor.commands.unsetTagMarkByUuid(uuid);
                  // Remove tag from store
                  useDocumentStore.getState().removeTag(uuid);
                });

                badge.appendChild(labelSpan);
                if (canLinkGeometry) {
                  badge.appendChild(linkBtn);
                }
                badge.appendChild(closeBtn);

                decorations.push(
                  Decoration.widget(pos, badge, {
                    // side: -1 places the widget before the character at pos
                    side: -1,
                    key: `tag-badge-${uuid}`,
                    // Prevent ProseMirror from treating clicks on the badge
                    // as document clicks (cursor placement, etc.)
                    stopEvent: (event) => {
                      const target = event.target as HTMLElement;
                      return (
                        target.closest('.tag-badge-action') !== null
                      );
                    },
                  })
                );
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
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

function createLinkIconSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('tag-badge-action-icon');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute(
    'd',
    'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1'
  );
  svg.appendChild(path);

  return svg;
}
