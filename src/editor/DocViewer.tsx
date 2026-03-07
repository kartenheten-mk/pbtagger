/**
 * DocViewer.tsx
 *
 * Renders the DocModel using TipTap in read-only mode.
 *
 * Key responsibilities:
 *  - Convert DocModel → TipTap JSON content
 *  - Intercept text/object selection events and store them for the Sidebar
 *  - Apply TagMark decorations for existing text tags
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';

import { TagMark } from './extensions/TagMark';
import { useDocumentStore } from '../store/useDocumentStore';
import type { Category, DocModel, Tag, PendingSelection } from '../types';

const OBJECT_ALT_PREFIX = '__pb_obj__';
const GRAPH_PLACEHOLDER_SRC = createGraphPlaceholderDataUri();

// ─── DocModel → TipTap JSON ───────────────────────────────────────────────────

interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

type TipTapContentNode =
  | { type: 'text'; text: string; marks?: TipTapMark[] }
  | { type: 'image'; attrs: { src: string; alt?: string; title?: string; class?: string; style?: string; 'data-tag-uuid'?: string; 'data-tag-color'?: string } };

interface TipTapParagraphNode {
  type: 'heading' | 'paragraph';
  attrs?: Record<string, unknown>;
  content?: TipTapContentNode[];
}

interface TipTapDoc {
  type: 'doc';
  content: TipTapParagraphNode[];
}

function docModelToTipTap(model: DocModel, tags: Tag[], categories: Category[]): TipTapDoc {
  // Build quick lookups
  const textTagsByPara = new Map<number, Tag[]>();
  const objectTagByKey = new Map<string, Tag>();

  for (const tag of tags) {
    const targetType = tag.targetType ?? 'text';
    if (targetType === 'text') {
      const arr = textTagsByPara.get(tag.paragraphIndex) ?? [];
      arr.push(tag);
      textTagsByPara.set(tag.paragraphIndex, arr);
      continue;
    }

    if ((targetType === 'image' || targetType === 'graph') && tag.runId) {
      objectTagByKey.set(buildObjectKey(targetType, tag.paragraphIndex, tag.runId), tag);
    }
  }

  const content: TipTapParagraphNode[] = model.paragraphs.map((para) => {
    const paraTags = (textTagsByPara.get(para.index) ?? []).sort(
      (a, b) => a.startOffset - b.startOffset
    );

    const paraNodes: TipTapContentNode[] = [];
    let globalCursor = 0; // Text offset in the paragraph

    for (const run of para.runs) {
      if (run.isImage && run.imageUrl) {
        const alt = encodeObjectAlt('image', para.index, run.id);
        const tag = objectTagByKey.get(buildObjectKey('image', para.index, run.id));
        const title = getObjectTitle(tag, categories, 'Bild');

        paraNodes.push({ type: 'image', attrs: buildObjectImageAttrs(run.imageUrl, alt, title, tag, categories) });
        continue;
      }

      if (run.isGraph) {
        const alt = encodeObjectAlt('graph', para.index, run.id);
        const tag = objectTagByKey.get(buildObjectKey('graph', para.index, run.id));
        const title = getObjectTitle(tag, categories, 'Diagram');

        paraNodes.push({ type: 'image', attrs: buildObjectImageAttrs(GRAPH_PLACEHOLDER_SRC, alt, title, tag, categories) });
        continue;
      }

      const runStart = globalCursor;
      const runEnd = globalCursor + run.text.length;
      const runText = run.text;
      let localCursor = 0;

      // Find tags that overlap with this run
      const overlappingTags = paraTags.filter((t) => t.startOffset < runEnd && t.endOffset > runStart);

      for (const tag of overlappingTags) {
        const cat = categories.find((c) => c.id === tag.categoryId);
        const color = cat?.color ?? '#3b82f6';
        const label = cat ? `${cat.temaName}: ${cat.name}` : tag.categoryId;

        const tagStartInRun = Math.max(0, tag.startOffset - runStart);
        const tagEndInRun = Math.min(runText.length, tag.endOffset - runStart);

        // Untagged text before the tag
        if (tagStartInRun > localCursor) {
          const slice = runText.slice(localCursor, tagStartInRun);
          if (slice) paraNodes.push({ type: 'text', text: slice });
        }

        // Tagged text
        if (tagStartInRun >= localCursor) {
          const slice = runText.slice(Math.max(localCursor, tagStartInRun), tagEndInRun);
          if (slice) {
            paraNodes.push({
              type: 'text',
              text: slice,
              marks: [
                {
                  type: 'tagMark',
                  attrs: {
                    tagUuid: tag.uuid,
                    categoryId: tag.categoryId,
                    color,
                    label,
                  },
                },
              ],
            });
            localCursor = tagEndInRun;
          }
        }
      }

      // Remaining untagged text after all tags in this run
      if (localCursor < runText.length) {
        const slice = runText.slice(localCursor);
        if (slice) paraNodes.push({ type: 'text', text: slice });
      }

      globalCursor = runEnd;
    }

    if (para.headingLevel > 0 && para.headingLevel <= 6) {
      return {
        type: 'heading',
        attrs: { level: para.headingLevel },
        content: paraNodes.length ? paraNodes : [{ type: 'text', text: ' ' }],
      };
    }

    return {
      type: 'paragraph',
      content: paraNodes.length ? paraNodes : undefined,
    };
  });

  return { type: 'doc', content };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DocViewerProps {
  docModel: DocModel;
  categories: Category[];
}

export const DocViewer: React.FC<DocViewerProps> = ({ docModel, categories }) => {
  const {
    tags,
    pendingSelection,
    setPendingSelection,
    showTags,
    selectedTagUuid,
    selectTag,
    removeTag,
  } = useDocumentStore();

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const lastUpdateRef = useRef({ tags, docModel, showTags, selectedTagUuid });

  // ── Build TipTap initial content ─────────────────────────────────────────
  const visibleTags = showTags ? tags : tags.filter((t) => t.uuid === selectedTagUuid);
  const initialContent = docModelToTipTap(docModel, visibleTags, categories);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bold: false,
        italic: false,
        strike: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        horizontalRule: false,
        hardBreak: false,
      }),
      Image.configure({
        inline: true,
        allowBase64: true,
        HTMLAttributes: {
          class: 'pb-object-node',
        },
      }),
      TagMark,
    ],
    content: initialContent,
    editable: false,
    editorProps: {
      handleDrop: () => true,
      handlePaste: () => true,
    },
  });

  // ── Sync tags → editor marks whenever tags change ─────────────────────────
  useEffect(() => {
    if (!editor) return;

    const prev = lastUpdateRef.current;
    lastUpdateRef.current = { tags, docModel, showTags, selectedTagUuid };

    // Don't rebuild TipTap content if ONLY the selectedTagUuid changed AND showTags is true.
    // (This prevents the DOM from reloading, which ruins smooth scrolling).
    if (
      showTags &&
      prev.showTags === showTags &&
      prev.tags === tags &&
      prev.docModel === docModel &&
      prev.selectedTagUuid !== selectedTagUuid
    ) {
      return;
    }

    const visibleTags = showTags ? tags : tags.filter((t) => t.uuid === selectedTagUuid);
    const newContent = docModelToTipTap(docModel, visibleTags, categories);

    // TipTap setContent replaces the DOM synchronously.
    editor.commands.setContent(newContent, { emitUpdate: false });
  }, [editor, tags, docModel, categories, showTags, selectedTagUuid]);

  // ── Persistent object highlight + badges for tagged images/graphs ────────
  useEffect(() => {
    if (!editorContainerRef.current) return;

    const container = editorContainerRef.current;
    const images = Array.from(container.querySelectorAll('img.pb-object-node')) as HTMLImageElement[];

    // Rebuild object badges from current tag state to avoid duplicates.
    container.querySelectorAll('.pb-object-tag-badge').forEach((el) => el.remove());

    const activeTags = showTags ? tags : tags.filter((t) => t.uuid === selectedTagUuid);
    const objectTagByKey = new Map<string, Tag>();

    for (const tag of activeTags) {
      const targetType = tag.targetType ?? 'text';
      if ((targetType === 'image' || targetType === 'graph') && tag.runId) {
        objectTagByKey.set(buildObjectKey(targetType, tag.paragraphIndex, tag.runId), tag);
      }
    }

    for (const img of images) {
      img.classList.remove('pb-object-tagged');
      img.style.removeProperty('--tag-color');
      img.style.removeProperty('--tag-bg');
      img.style.removeProperty('--tag-border');
      img.removeAttribute('data-tag-uuid');
      img.removeAttribute('data-tag-color');

      const parsed = parseObjectAlt(img.getAttribute('alt'));
      if (!parsed) continue;

      const tag = objectTagByKey.get(buildObjectKey(parsed.type, parsed.paragraphIndex, parsed.runId));
      if (!tag) continue;

      const color = getObjectTagColor(tag, categories);
      img.classList.add('pb-object-tagged');
      img.style.setProperty('--tag-color', color);
      img.style.setProperty('--tag-bg', hexToRgba(color, 0.18));
      img.style.setProperty('--tag-border', hexToRgba(color, 0.45));
      img.setAttribute('data-tag-uuid', tag.uuid);
      img.setAttribute('data-tag-color', color);

      const badge = document.createElement('span');
      badge.className = 'tag-badge-widget pb-object-tag-badge';
      badge.setAttribute('data-tag-uuid', tag.uuid);
      badge.style.setProperty('--tag-color', color);
      badge.style.setProperty('--tag-bg', hexToRgba(color, 0.12));
      badge.style.setProperty('--tag-border', hexToRgba(color, 0.4));

      const labelSpan = document.createElement('span');
      labelSpan.className = 'tag-badge-label';
      labelSpan.textContent = getObjectTagLabel(tag, categories).toUpperCase();

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tag-badge-close';
      closeBtn.setAttribute('type', 'button');
      closeBtn.setAttribute('aria-label', 'Ta bort tagg');
      closeBtn.textContent = '×';

      closeBtn.addEventListener('mousedown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        removeTag(tag.uuid);
        if (selectedTagUuid === tag.uuid) {
          selectTag(null);
        }
      });

      closeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });

      badge.appendChild(labelSpan);
      badge.appendChild(closeBtn);

      badge.addEventListener('mousedown', (event) => {
        const target = event.target as HTMLElement;
        if (target.closest('.tag-badge-close')) return;
        event.preventDefault();
        event.stopPropagation();
        selectTag(tag.uuid);
      });

      const parent = img.parentElement;
      if (parent) {
        if (window.getComputedStyle(parent).position === 'static') {
          parent.style.position = 'relative';
        }

        badge.style.left = `${img.offsetLeft + 8}px`;
        badge.style.top = `${img.offsetTop + 8}px`;
        parent.appendChild(badge);
      }
    }
  }, [tags, showTags, selectedTagUuid, categories, docModel, selectTag, removeTag]);

  // ── Highlight and scroll to selected tag ───────────────────────────────────
  useEffect(() => {
    if (!editorContainerRef.current) return;

    // Clear previous highlights
    const container = editorContainerRef.current;
    container.querySelectorAll('.is-selected').forEach((el) => el.classList.remove('is-selected'));
    container.querySelectorAll('.is-selected-object').forEach((el) => el.classList.remove('is-selected-object'));
    container.querySelectorAll('.is-selected-table').forEach((el) => el.classList.remove('is-selected-table'));

    if (!selectedTagUuid) return;

    const selectedTag = tags.find((t) => t.uuid === selectedTagUuid);
    if (!selectedTag) return;

    const targetType = selectedTag.targetType ?? 'text';

    if (targetType === 'text') {
      const elements = container.querySelectorAll(`[data-tag-uuid="${selectedTagUuid}"]`);
      if (elements.length > 0) {
        elements.forEach((el) => el.classList.add('is-selected'));
        elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    if ((targetType === 'image' || targetType === 'graph') && selectedTag.runId) {
      const expectedAlt = encodeObjectAlt(targetType, selectedTag.paragraphIndex, selectedTag.runId);
      const images = Array.from(container.querySelectorAll('img.pb-object-node')) as HTMLImageElement[];
      const match = images.find((img) => img.getAttribute('alt') === expectedAlt);
      if (match) {
        match.classList.add('is-selected-object');
        const badge = container.querySelector(`.pb-object-tag-badge[data-tag-uuid="${selectedTagUuid}"]`);
        if (badge) badge.classList.add('is-selected');
        match.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    if (targetType === 'table' && selectedTag.tableId) {
      const proseMirrorEl = container.querySelector('.ProseMirror');
      if (!proseMirrorEl) return;

      const allParaEls = Array.from(
        proseMirrorEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6')
      );

      const tableParagraphs = docModel.paragraphs
        .filter((p) => p.tableId === selectedTag.tableId)
        .map((p) => p.index)
        .filter((idx) => idx >= 0 && idx < allParaEls.length)
        .map((idx) => allParaEls[idx]);

      if (tableParagraphs.length > 0) {
        tableParagraphs.forEach((el) => el.classList.add('is-selected-table'));
        tableParagraphs[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [selectedTagUuid, tags, docModel]);

  // ── Persistent highlight for pending text selection (survives focus changes) ─
  useEffect(() => {
    if (typeof CSS === 'undefined' || !CSS.highlights) return;

    const textSelections = (pendingSelection ?? []).filter((s) => s.type === 'text');

    if (textSelections.length === 0 || !editorContainerRef.current) {
      CSS.highlights.delete('pending-selection');
      return;
    }

    const proseMirrorEl = editorContainerRef.current.querySelector('.ProseMirror');
    if (!proseMirrorEl) return;

    const allParaEls = Array.from(
      proseMirrorEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6')
    );

    const ranges: Range[] = [];

    for (const sel of textSelections) {
      const paraEl = allParaEls[sel.paragraphIndex];
      if (!paraEl) continue;

      const startPos = findDomNodeForOffset(paraEl, sel.startOffset);
      const endPos = findDomNodeForOffset(paraEl, sel.endOffset);
      if (!startPos || !endPos) continue;

      try {
        const range = document.createRange();
        range.setStart(startPos.node, startPos.offset);
        range.setEnd(endPos.node, endPos.offset);
        ranges.push(range);
      } catch {
        // Ignore invalid ranges (e.g. if DOM changed)
      }
    }

    if (ranges.length > 0) {
      const highlight = new Highlight(...ranges);
      CSS.highlights.set('pending-selection', highlight);
    } else {
      CSS.highlights.delete('pending-selection');
    }

    return () => {
      CSS.highlights.delete('pending-selection');
    };
  }, [pendingSelection]);

  // ─── Handle text selection → store in Zustand (sidebar will pick up) ───────
  const handleMouseUp = useCallback(() => {
    if (!editor) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect.width) return;

    const startParaEl = findParagraphElement(range.startContainer);
    const endParaEl = findParagraphElement(range.endContainer);
    if (!startParaEl || !endParaEl || !editorContainerRef.current) return;

    // Scope to ProseMirror root only.
    const proseMirrorEl = editorContainerRef.current.querySelector('.ProseMirror');
    if (!proseMirrorEl) return;

    const allParaEls = Array.from(
      proseMirrorEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6')
    );
    const startIndex = allParaEls.indexOf(startParaEl);
    const endIndex = allParaEls.indexOf(endParaEl);
    if (startIndex === -1 || endIndex === -1) return;

    const pendingSelections: PendingSelection[] = [];

    for (let i = Math.min(startIndex, endIndex); i <= Math.max(startIndex, endIndex); i++) {
      const paraEl = allParaEls[i];
      const paraText = getCleanTextContent(paraEl);

      let startOffset = 0;
      let endOffset = paraText.length;

      // DOM follows visual order; startContainer comes before endContainer.
      if (i === startIndex) {
        startOffset = getTextOffsetInParagraph(paraEl, range.startContainer, range.startOffset);
      }
      if (i === endIndex) {
        endOffset = getTextOffsetInParagraph(paraEl, range.endContainer, range.endOffset);
      }

      if (startIndex === endIndex) {
        const min = Math.min(startOffset, endOffset);
        const max = Math.max(startOffset, endOffset);
        startOffset = min;
        endOffset = max;
      }

      if (startOffset < endOffset) {
        const textSlice = paraText.slice(startOffset, endOffset);
        if (textSlice.trim()) {
          pendingSelections.push({
            type: 'text',
            text: textSlice,
            paragraphIndex: i,
            startOffset,
            endOffset,
          });
        }
      }
    }

    if (pendingSelections.length === 0) return;

    setPendingSelection(pendingSelections);
  }, [editor, setPendingSelection]);

  if (!editor) return null;

  return (
    <div className="relative h-full" ref={editorContainerRef}>
      {/* Selection hint banner */}
      <div className="sticky top-0 z-10 bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center gap-2">
        <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-blue-600">
          Markera text, klicka bild/diagram eller klicka i en tabell för att skapa en tagg.
        </p>
      </div>

      {/* TipTap editor */}
      <div
        className="px-8 py-6 cursor-text select-text"
        onMouseUp={handleMouseUp}
        onClick={(e) => {
          const target = e.target as HTMLElement;

          const markEl = target.closest('.tag-mark');
          if (markEl) {
            const uuid = markEl.getAttribute('data-tag-uuid');
            if (uuid) {
              selectTag(uuid);
              return;
            }
          }
          const objectBadgeEl = target.closest('.pb-object-tag-badge');
          if (objectBadgeEl) {
            const uuid = objectBadgeEl.getAttribute('data-tag-uuid');
            if (uuid) {
              selectTag(uuid);
              return;
            }
          }
          const imgEl = target.closest('img.pb-object-node') as HTMLImageElement | null;
          if (imgEl) {
            const parsed = parseObjectAlt(imgEl.getAttribute('alt'));
            if (parsed) {
              const existingObjectTag = tags.find((t) => {
                const targetType = t.targetType ?? 'text';
                return (
                  (targetType === 'image' || targetType === 'graph') &&
                  targetType === parsed.type &&
                  t.paragraphIndex === parsed.paragraphIndex &&
                  t.runId === parsed.runId
                );
              });

              window.getSelection()?.removeAllRanges();

              if (existingObjectTag) {
                setPendingSelection(null);
                selectTag(existingObjectTag.uuid);
                return;
              }

              setPendingSelection([
                {
                  type: parsed.type,
                  text: parsed.type === 'image' ? 'Bild' : 'Diagram',
                  paragraphIndex: parsed.paragraphIndex,
                  startOffset: 0,
                  endOffset: 0,
                  runId: parsed.runId,
                },
              ]);
              selectTag(null);
              return;
            }
          }

          const selection = window.getSelection();
          const isCollapsed = !selection || selection.isCollapsed;

          if (isCollapsed && !target.closest('.tag-badge-widget') && editorContainerRef.current) {
            const proseMirrorEl = editorContainerRef.current.querySelector('.ProseMirror');
            const paraEl = findParagraphElement(target);

            if (proseMirrorEl && paraEl) {
              const allParaEls = Array.from(
                proseMirrorEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6')
              );
              const paraIndex = allParaEls.indexOf(paraEl);

              if (paraIndex >= 0 && paraIndex < docModel.paragraphs.length) {
                const docPara = docModel.paragraphs[paraIndex];
                if (docPara.tableId) {
                  const tableParagraphs = docModel.paragraphs.filter((p) => p.tableId === docPara.tableId);
                  const anchor = tableParagraphs.find((p) => p.isTableStart) ?? tableParagraphs[0] ?? docPara;
                  const label = anchor.tableIndex ? `Tabell ${anchor.tableIndex}` : 'Tabell';

                  setPendingSelection([
                    {
                      type: 'table',
                      text: label,
                      paragraphIndex: anchor.index,
                      startOffset: 0,
                      endOffset: 0,
                      tableId: docPara.tableId,
                    },
                  ]);
                  selectTag(null);
                  window.getSelection()?.removeAllRanges();
                  return;
                }
              }
            }

            selectTag(null);
          }
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * TreeWalker NodeFilter that rejects text nodes living inside a badge widget.
 * Badge widgets are injected as ProseMirror decoration elements and must not
 * be counted as document content when computing character offsets.
 */
const noBadgeFilter: NodeFilter = {
  acceptNode(node: Node) {
    if ((node as Node).parentElement?.closest('.tag-badge-widget')) {
      return NodeFilter.FILTER_REJECT;
    }
    return NodeFilter.FILTER_ACCEPT;
  },
};

/**
 * Return the plain text of a paragraph element, excluding any text that
 * belongs to inline badge widget decorations.
 */
function getCleanTextContent(container: Element): string {
  let text = '';
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, noBadgeFilter);
  let node = walker.nextNode();
  while (node) {
    text += node.textContent ?? '';
    node = walker.nextNode();
  }
  return text;
}

/** Walk up the DOM to find the nearest paragraph / heading element */
function findParagraphElement(node: Node): Element | null {
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === 1) {
      const el = current as Element;
      const tag = el.tagName.toLowerCase();
      if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
        return el;
      }
    }
    current = current.parentNode;
  }
  return null;
}

/**
 * Compute the character offset of `node:offset` within the text content
 * of `container` (a paragraph element), skipping badge widget text nodes.
 */
function getTextOffsetInParagraph(
  container: Element,
  node: Node,
  offset: number
): number {
  let total = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, noBadgeFilter);
  let current = walker.nextNode();
  while (current) {
    if (current === node) {
      return total + offset;
    }
    total += (current.textContent ?? '').length;
    current = walker.nextNode();
  }
  return total;
}

/**
 * Given a paragraph element and a character offset (skipping badge widgets),
 * return the DOM text node and the local offset within that text node.
 */
function findDomNodeForOffset(
  container: Element,
  targetOffset: number
): { node: Node; offset: number } | null {
  let accumulated = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, noBadgeFilter);
  let current = walker.nextNode();
  while (current) {
    const len = (current.textContent ?? '').length;
    if (accumulated + len >= targetOffset) {
      return { node: current, offset: targetOffset - accumulated };
    }
    accumulated += len;
    current = walker.nextNode();
  }
  return null;
}

function buildObjectKey(type: 'image' | 'graph', paragraphIndex: number, runId: string): string {
  return `${type}|${paragraphIndex}|${runId}`;
}

function encodeObjectAlt(type: 'image' | 'graph', paragraphIndex: number, runId: string): string {
  return `${OBJECT_ALT_PREFIX}|${type}|${paragraphIndex}|${runId}`;
}

function parseObjectAlt(rawAlt: string | null): { type: 'image' | 'graph'; paragraphIndex: number; runId: string } | null {
  if (!rawAlt || !rawAlt.startsWith(`${OBJECT_ALT_PREFIX}|`)) return null;

  const parts = rawAlt.split('|');
  if (parts.length < 4) return null;

  const type = parts[1];
  const paraIdx = parseInt(parts[2], 10);
  const runId = parts.slice(3).join('|');

  if ((type !== 'image' && type !== 'graph') || Number.isNaN(paraIdx) || !runId) {
    return null;
  }

  return {
    type,
    paragraphIndex: paraIdx,
    runId,
  };
}

function getObjectTitle(tag: Tag | undefined, categories: Category[], fallback: string): string {
  if (!tag) return fallback;
  const category = categories.find((c) => c.id === tag.categoryId);
  if (!category) return `${fallback} (taggad)`;
  return `${fallback} - ${category.temaName}: ${category.name}`;
}

function getObjectTagLabel(tag: Tag, categories: Category[]): string {
  const category = categories.find((c) => c.id === tag.categoryId);
  if (!category) return tag.categoryId;
  return `${category.temaName}: ${category.name}`;
}

function buildObjectImageAttrs(
  src: string,
  alt: string,
  title: string,
  tag: Tag | undefined,
  categories: Category[]
): { src: string; alt: string; title: string; class: string; style?: string; 'data-tag-uuid'?: string; 'data-tag-color'?: string } {
  if (!tag) {
    return {
      src,
      alt,
      title,
      class: 'pb-object-node',
    };
  }

  const color = getObjectTagColor(tag, categories);
  const tagBg = hexToRgba(color, 0.18);
  const tagBorder = hexToRgba(color, 0.45);

  return {
    src,
    alt,
    title,
    class: 'pb-object-node pb-object-tagged',
    style: `--tag-color: ${color}; --tag-bg: ${tagBg}; --tag-border: ${tagBorder};`,
    'data-tag-uuid': tag.uuid,
    'data-tag-color': color,
  };
}

function getObjectTagColor(tag: Tag, categories: Category[]): string {
  const category = categories.find((c) => c.id === tag.categoryId);
  return category?.color ?? '#3b82f6';
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return `rgba(59,130,246,${alpha})`;
  }

  return `rgba(${r},${g},${b},${alpha})`;
}
function createGraphPlaceholderDataUri(): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90" viewBox="0 0 240 90" role="img" aria-label="Diagram">
  <rect x="1" y="1" width="238" height="88" rx="8" fill="#f8fafc" stroke="#cbd5e1"/>
  <path d="M18 68 L58 52 L98 58 L138 34 L178 44 L218 22" fill="none" stroke="#2563eb" stroke-width="3"/>
  <circle cx="58" cy="52" r="3" fill="#2563eb"/>
  <circle cx="138" cy="34" r="3" fill="#2563eb"/>
  <text x="16" y="22" fill="#334155" font-size="12" font-family="Arial, sans-serif">Diagram</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
























