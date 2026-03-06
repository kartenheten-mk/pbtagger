/**
 * DocViewer.tsx
 *
 * Renders the DocModel using TipTap in read-only mode.
 *
 * Key responsibilities:
 *  - Convert DocModel → TipTap JSON content
 *  - Intercept text selection events and show the TagPopover
 *  - Apply TagMark decorations for existing tags
 *  - Compute paragraph/offset coordinates and pass them back to the store
 *
 * The editor is set to editable=false. Only selection for tagging is
 * possible — the user cannot type or delete.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { v4 as uuidv4 } from 'uuid';

import { TagMark } from './extensions/TagMark';
import { TagPopover } from './TagPopover';
import { useDocumentStore } from '../store/useDocumentStore';
import type { Category, DocModel, Tag, Tema } from '../types';

// ─── DocModel → TipTap JSON ───────────────────────────────────────────────────

interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface TipTapTextNode {
  type: 'text';
  text: string;
  marks?: TipTapMark[];
}

interface TipTapParagraphNode {
  type: 'heading' | 'paragraph';
  attrs?: Record<string, unknown>;
  content?: TipTapTextNode[];
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
    const paraText = para.runs.map((r) => r.text).join('');
    const paraTags = (tagsByPara.get(para.index) ?? []).sort(
      (a, b) => a.startOffset - b.startOffset
    );

    // Build text segments with optional tag mark
    const textNodes: TipTapTextNode[] = [];
    let cursor = 0;

    for (const tag of paraTags) {
      const cat = categories.find((c) => c.id === tag.categoryId);
      const color = cat?.color ?? '#3b82f6';

      // Text before this tag
      if (tag.startOffset > cursor) {
        const slice = paraText.slice(cursor, tag.startOffset);
        if (slice) textNodes.push({ type: 'text', text: slice });
      }

      // Tagged text
      const taggedSlice = paraText.slice(tag.startOffset, tag.endOffset);
      if (taggedSlice) {
        textNodes.push({
          type: 'text',
          text: taggedSlice,
          marks: [
            {
              type: 'tagMark',
              attrs: {
                tagUuid: tag.uuid,
                categoryId: tag.categoryId,
                color,
              },
            },
          ],
        });
      }
      cursor = tag.endOffset;
    }

    // Remaining text after last tag
    if (cursor < paraText.length) {
      const slice = paraText.slice(cursor);
      if (slice) textNodes.push({ type: 'text', text: slice });
    }

    // Empty paragraph guard
    if (textNodes.length === 0 && paraText === '') {
      // TipTap needs at least an empty text node or nothing for empty paras
    }

    if (para.headingLevel > 0 && para.headingLevel <= 6) {
      return {
        type: 'heading',
        attrs: { level: para.headingLevel },
        content: textNodes.length ? textNodes : [{ type: 'text', text: ' ' }],
      };
    }

    return {
      type: 'paragraph',
      content: textNodes.length ? textNodes : undefined,
    };
  });

  // Filter out empty trailing paragraphs for cleanliness
  return { type: 'doc', content };
}

// ─── Selection state ──────────────────────────────────────────────────────────

interface SelectionInfo {
  text: string;
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
  popoverPosition: { top: number; left: number };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DocViewerProps {
  docModel: DocModel;
  teman: Tema[];
  categories: Category[];
}

export const DocViewer: React.FC<DocViewerProps> = ({ docModel, teman, categories }) => {
  const { tags, addTag, removeTag } = useDocumentStore();
  const [pendingSelection, setPendingSelection] = useState<SelectionInfo | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // ── Build TipTap initial content ─────────────────────────────────────────
  const initialContent = docModelToTipTap(docModel, [], categories);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable all editing-related input rules
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
      TagMark,
    ],
    content: initialContent,
    editable: false,
    // Prevent any drag or paste
    editorProps: {
      handleDrop: () => true,
      handlePaste: () => true,
    },
  });

  // ── Sync tags → editor marks whenever tags change ─────────────────────────
  useEffect(() => {
    if (!editor) return;
    const newContent = docModelToTipTap(docModel, tags, categories);
    // Replace content without adding to undo history
    editor.commands.setContent(newContent, { emitUpdate: false });
  }, [editor, tags, docModel, categories]);

  // ── Handle text selection → show popover ─────────────────────────────────
  const handleMouseUp = useCallback(() => {
    if (!editor) return;

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    // Get bounding rect for popover positioning
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect.width) return;

    // Walk up from the anchor node to find the paragraph element
    const anchorNode = selection.anchorNode;
    if (!anchorNode) return;

    const paraEl = findParagraphElement(anchorNode);
    if (!paraEl || !editorContainerRef.current) return;

    // Find paragraph index by counting paragraphs in the editor DOM
    const allParaEls = Array.from(
      editorContainerRef.current.querySelectorAll('p, h1, h2, h3, h4, h5, h6')
    );
    const paraIndex = allParaEls.indexOf(paraEl);
    if (paraIndex === -1) return;

    // Compute offsets within the paragraph text
    const paraText = paraEl.textContent ?? '';
    const anchorOffset = getTextOffsetInParagraph(paraEl, selection.anchorNode!, selection.anchorOffset);
    const focusOffset = getTextOffsetInParagraph(paraEl, selection.focusNode!, selection.focusOffset);

    const startOffset = Math.min(anchorOffset, focusOffset);
    const endOffset = Math.max(anchorOffset, focusOffset);

    if (startOffset === endOffset) return;

    setPendingSelection({
      text: paraText.slice(startOffset, endOffset),
      paragraphIndex: paraIndex,
      startOffset,
      endOffset,
      popoverPosition: {
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
      },
    });
  }, [editor]);

  // ── Apply tag when user confirms in popover ───────────────────────────────
  const handleApplyTag = useCallback(
    (categoryId: string, note: string) => {
      if (!pendingSelection || !editor) return;

      const cat = categories.find((c) => c.id === categoryId);
      if (!cat) return;

      const newTag: Tag = {
        uuid: uuidv4(),
        categoryId,
        text: pendingSelection.text,
        paragraphIndex: pendingSelection.paragraphIndex,
        startOffset: pendingSelection.startOffset,
        endOffset: pendingSelection.endOffset,
        note: note || undefined,
        createdAt: new Date().toISOString(),
      };

      addTag(newTag);
      setPendingSelection(null);

      // Clear browser selection
      window.getSelection()?.removeAllRanges();
    },
    [pendingSelection, editor, categories, addTag]
  );

  const handleCancelPopover = useCallback(() => {
    setPendingSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  if (!editor) return null;

  return (
    <div className="relative h-full" ref={editorContainerRef}>
      {/* Selection hint banner */}
      <div className="sticky top-0 z-10 bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center gap-2">
        <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-blue-600">
          Select any text in the document to apply a tag. The document is read-only.
        </p>
      </div>

      {/* TipTap editor */}
      <div
        className="px-8 py-6 cursor-text select-text"
        onMouseUp={handleMouseUp}
      >
        <EditorContent editor={editor} />
      </div>

      {/* Tag Popover */}
      {pendingSelection && (
        <TagPopover
          position={pendingSelection.popoverPosition}
          selectedText={pendingSelection.text}
          teman={teman}
          categories={categories}
          onApply={handleApplyTag}
          onCancel={handleCancelPopover}
        />
      )}
    </div>
  );
};

// ─── DOM helpers ──────────────────────────────────────────────────────────────

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
 * of `container` (a paragraph element).
 */
function getTextOffsetInParagraph(
  container: Element,
  node: Node,
  offset: number
): number {
  let total = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
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
