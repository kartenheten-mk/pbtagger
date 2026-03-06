# Planbeskrivning Tagger

A web application for annotating `.docx` planning documents by tagging text and linking those tags to spatial geometries — with **lossless DOCX export**.

---

## Features

| Feature | Details |
|---|---|
| 📄 **DOCX Import** | Upload any `.docx` file via drag-and-drop or file picker |
| 🏷️ **Text Tagging** | Select any text in the document and assign it a category tag |
| 🎨 **Categories** | 7 built-in categories (Requirement, Area, Building, Road, Regulation, Landmark, Note) — easily extended via `src/data/categories.json` |
| 🔗 **Geometry Linking** | Link each tag to a geometry (point, polygon, line) via UUID |
| 🗺️ **Geometry Panel** | Canvas placeholder for spatial geometries — ready to be replaced with a real map (Leaflet / MapLibre / OpenLayers) |
| 📥 **Lossless Export** | Export the annotated `.docx` — all original formatting, images, tables, headers/footers preserved |

---

## Lossless DOCX Strategy

The application **never converts the document to HTML and back**. Instead:

1. The `.docx` is opened as a **ZIP archive** using [PizZip](https://github.com/open-xml-templating/pizzip)
2. `word/document.xml` is parsed with [@xmldom/xmldom](https://github.com/xmldom/xmldom) — **read-only** during import
3. The document is rendered in a **read-only [TipTap](https://tiptap.dev/)** editor (ProseMirror under the hood) — users can only select text, not edit it
4. On export, tagged runs are wrapped in OOXML **Content Controls** (`<w:sdt>`) and tag metadata is stored in a **Custom XML Part** (`customXml/item1.xml`)
5. All other ZIP entries (images, styles, themes, headers, footers, etc.) are re-zipped **byte-for-byte untouched**

### OOXML injection example

```xml
<!-- word/document.xml — tagged run -->
<w:sdt>
  <w:sdtPr>
    <w:tag w:val="550e8400-e29b-41d4-a716-446655440000"/>
    <w:id w:val="12345678"/>
    <w:dataBinding
      w:prefixMappings="xmlns:pb='https://planbeskrivning/tagging/v1'"
      w:xpath="/pb:tags/pb:tag[@uuid='550e8400...']/pb:text"
      w:storeItemID="{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}"/>
  </w:sdtPr>
  <w:sdtContent>
    <w:r><w:t>The tagged text</w:t></w:r>
  </w:sdtContent>
</w:sdt>

<!-- customXml/item1.xml — metadata store -->
<pb:tags xmlns:pb="https://planbeskrivning/tagging/v1">
  <pb:tag uuid="550e8400-..." categoryId="area"
          paragraphIndex="3" startOffset="12" endOffset="28"
          geometryId="geo-uuid-here" createdAt="2026-03-06T...">
    <pb:text>The tagged text</pb:text>
  </pb:tag>
</pb:tags>
```

---

## Tech Stack

| Library | Version | Purpose |
|---|---|---|
| [React](https://react.dev/) | 18 | UI framework |
| [Vite](https://vitejs.dev/) | 5 | Build tool / dev server |
| [TypeScript](https://www.typescriptlang.org/) | 5 | Type safety |
| [Tailwind CSS](https://tailwindcss.com/) | 4 | Utility-first styling |
| [TipTap](https://tiptap.dev/) | 2 | ProseMirror-based read-only editor |
| [PizZip](https://github.com/open-xml-templating/pizzip) | 3 | ZIP/DOCX handling |
| [@xmldom/xmldom](https://github.com/xmldom/xmldom) | 0.9 | XML DOM parsing |
| [Zustand](https://github.com/pmndrs/zustand) | 5 | Lightweight state management |
| [uuid](https://github.com/uuidjs/uuid) | 11 | UUID generation for tags |
| [file-saver](https://github.com/eligrey/FileSaver.js/) | 2 | Browser file download |

---

## Project Structure

```
src/
├── types/
│   └── index.ts               # Category, Tag, Geometry, DocModel types
├── data/
│   └── categories.json        # Tag category definitions (mock — replace with real file)
├── store/
│   └── useDocumentStore.ts    # Zustand store: document, tags, geometries, linking state
├── docx/
│   ├── XmlHelpers.ts          # Namespace constants, DOM helpers, heading detection
│   ├── DocxParser.ts          # PizZip + xmldom → DocModel (read-only import)
│   ├── ContentControlBuilder.ts  # Build <w:sdt> and customXml XML fragments
│   └── DocxExporter.ts        # Inject SDTs, write Custom XML Part, download file
├── editor/
│   ├── extensions/
│   │   └── TagMark.ts         # TipTap Mark extension: coloured tag highlights
│   ├── TagPopover.tsx         # Category picker popover (appears on text selection)
│   └── DocViewer.tsx          # Read-only TipTap editor + selection → tag flow
├── geometry/
│   └── GeometryPanel.tsx      # Canvas placeholder + geometry list + linking mode
├── components/
│   ├── FileUpload.tsx         # Drag-and-drop .docx upload area
│   ├── Header.tsx             # Top bar: file name, tag count, export button
│   ├── Sidebar.tsx            # Tag list with category filter and geometry link actions
│   └── TagBadge.tsx           # Coloured category pill component
├── App.tsx                    # Root: upload view ↔ 3-panel editor view
├── main.tsx                   # React entry point
└── index.css                  # Tailwind + ProseMirror base styles
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Install & Run

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173` (or the next available port).

### Build for Production

```bash
npm run build
npm run preview
```

---

## Customising Categories

Edit `src/data/categories.json` to add, remove, or rename categories:

```json
[
  {
    "id": "my-category",
    "name": "My Category",
    "color": "#6366f1",
    "description": "Optional description shown in the tag popover"
  }
]
```

Changes are picked up automatically by the Vite dev server.

---

## Replacing the Canvas with a Real Map

The `src/geometry/GeometryPanel.tsx` renders a simple HTML5 canvas as a placeholder.
To swap it for a real map:

1. Install your map library (e.g. `npm install leaflet react-leaflet`)
2. Replace the `<canvas>` block in `GeometryPanel.tsx` with your map component
3. When the user clicks a geometry feature, call:
   ```ts
   finishLinking(linkingTagUuid, geometry.uuid);
   ```
   This completes the tag–geometry link automatically.

---

## Export Format

Exported files are named `<original-name>_tagged.docx` and contain:

- All original content preserved exactly
- Tagged text wrapped in `<w:sdt>` Content Controls (visible in Word's Developer tab)
- `customXml/item1.xml` — machine-readable tag & geometry metadata (namespace: `https://planbeskrivning/tagging/v1`)
- Updated `[Content_Types].xml` and `word/_rels/document.xml.rels`

---

## License

MIT
