/**
 * DocViewer.tsx
 *
 * Renders the DocModel using TipTap in read-only mode.
 *
 * Key responsibilities:
 *  - Convert DocModel → TipTap JSON content
 *  - Intercept text selection events and store them for the Sidebar to consume
 *  - Apply TagMark decorations for existing tags
 *
 * The editor is set to editable=false. Only selection for tagging is
 * possible — the user cannot type or delete.
 *
 * When text is selected, the selection info is written to the Zustand store
 * (pendingSelection). The Sidebar picks this up and switches to "Assign Tags"
 * mode automatically.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';

import { TagMark } from './extensions/TagMark';
import { useDocumentStore } from '../store/useDocumentStore';
import type { Category, DocModel, Tag, Tema, PendingSelection } from '../types';

// ─── DocModel → TipTap JSON ───────────────────────────────────────────────────

interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

type TipTapContentNode =
  | { type: 'text'; text: string; marks?: TipTapMark[] }
  | { type: 'image'; attrs: { src: string; alt?: string; title?: string } };

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
  // Build a quick lookup: paragraphIndex → tags sorted by startOffset
  const tagsByPara = new Map<number, Tag[]>();
  for (const tag of tags) {
    const arr = tagsByPara.get(tag.paragraphIndex) ?? [];
    arr.push(tag);
    tagsByPara.set(tag.paragraphIndex, arr);
  }

  const content: TipTapParagraphNode[] = model.paragraphs.map((para) => {
    const paraTags = (tagsByPara.get(para.index) ?? []).sort(
      (a, b) => a.startOffset - b.startOffset
    );

    const paraNodes: TipTapContentNode[] = [];
    let globalCursor = 0; // Text offset in the paragraph

    for (const run of para.runs) {
      if (run.isImage && run.imageUrl) {
        paraNodes.push({ type: 'image', attrs: { src: run.imageUrl } });
        continue;
      }

      const runStart = globalCursor;
      const runEnd = globalCursor + run.text.length;
      const runText = run.text;

      let localCursor = 0;

      // Find tags that overlap with this run
      const overlappingTags = paraTags.filter(t => t.startOffset < runEnd && t.endOffset > runStart);

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
  teman: Tema[];
  categories: Category[];
}

export const DocViewer: React.FC<DocViewerProps> = ({ docModel, teman: _teman, categories }) => {
  const { tags, setPendingSelection, showTags } = useDocumentStore();
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // ── Build TipTap initial content ─────────────────────────────────────────
  const initialContent = docModelToTipTap(docModel, showTags ? tags : [], categories);

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
    const newContent = docModelToTipTap(docModel, showTags ? tags : [], categories);
    editor.commands.setContent(newContent, { emitUpdate: false });
  }, [editor, tags, docModel, categories, showTags]);

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

    // Scope to the ProseMirror root only — the hint banner above the editor
    // also contains a <p> which would otherwise shift all paragraph indices by 1.
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

      // The DOM sequence follows visual document order, range.startContainer is always before range.endContainer.
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
            text: textSlice,
            paragraphIndex: i,
            startOffset,
            endOffset,
          });
        }
      }
    }

    if (pendingSelections.length === 0) return;

    // Store pending selection in Zustand — Sidebar will switch to "Assign" mode
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
          Markera text i dokumentet för att applicera en tagg via sidopanelen.
        </p>
      </div>

      {/* TipTap editor */}
      <div
        className="px-8 py-6 cursor-text select-text"
        onMouseUp={handleMouseUp}
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
