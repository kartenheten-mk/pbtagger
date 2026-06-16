import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Minimal read-only table schema for rendering imported DOCX tables.
 *
 * The app does not edit table structure in TipTap; DOCX export remains
 * lossless through the original ZIP/XML. These nodes therefore only need to
 * parse/render stable HTML table elements and accept block content in cells.
 */

export const ReadOnlyTable = Node.create({
  name: 'table',

  group: 'block',
  content: 'tableRow+',
  isolating: true,

  addAttributes() {
    return {
      tableId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-table-id'),
        renderHTML: (attributes) =>
          attributes.tableId ? { 'data-table-id': attributes.tableId } : {},
      },
      tableIndex: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-table-index');
          if (!raw) return null;
          const parsed = parseInt(raw, 10);
          return Number.isFinite(parsed) ? parsed : null;
        },
        renderHTML: (attributes) =>
          attributes.tableIndex
            ? { 'data-table-index': String(attributes.tableIndex) }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'table' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['table', mergeAttributes(HTMLAttributes), ['tbody', 0]];
  },
});

export const ReadOnlyTableRow = Node.create({
  name: 'tableRow',

  content: 'tableCell+',

  parseHTML() {
    return [{ tag: 'tr' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['tr', mergeAttributes(HTMLAttributes), 0];
  },
});

export const ReadOnlyTableCell = Node.create({
  name: 'tableCell',

  content: 'block+',
  isolating: true,

  addAttributes() {
    return {
      colspan: {
        default: 1,
        parseHTML: (element) => {
          const parsed = parseInt(element.getAttribute('colspan') ?? '1', 10);
          return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
        },
        renderHTML: (attributes) =>
          attributes.colspan && attributes.colspan > 1
            ? { colspan: String(attributes.colspan) }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'td' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['td', mergeAttributes(HTMLAttributes), 0];
  },
});