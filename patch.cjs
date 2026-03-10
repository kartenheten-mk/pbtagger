const fs = require('fs');
let code = fs.readFileSync('src/docx/DocxParser.ts', 'utf8');

code = code.replace(
  `  const paragraphs = extractParagraphs(body, zip, relsMap);

  // Extract any embedded tags from a previously exported file
  const tags = extractTagsFromCustomXml(zip);

  return {
    zip,
    docModel: { paragraphs },
    tags,
  };`,
  `  const extractedBookmarks: ExtractedBookmark[] = [];
  const activeBookmarks: Record<string, Partial<ExtractedBookmark>> = {};

  const paragraphs = extractParagraphs(body, zip, relsMap, extractedBookmarks, activeBookmarks);

  // Extract any embedded tags from a previously exported file
  let tags = extractTagsFromCustomXml(zip);

  // Reconcile tags using extracted bookmarks
  tags = reconcileTagsWithBookmarks(tags, extractedBookmarks, paragraphs);

  return {
    zip,
    docModel: { paragraphs },
    tags,
  };`
);

code = code.replace(
  `interface TableContext {
  tableId: string;
  tableIndex: number;
  firstParagraphSeen: boolean;
}`,
  `interface TableContext {
  tableId: string;
  tableIndex: number;
  firstParagraphSeen: boolean;
}

export interface ExtractedBookmark {
  id: string;
  name: string;
  paragraphIndex: number;
  startOffset?: number;
  endOffset?: number;
  runId?: string; // used for object bookmarks
}`
);

code = code.replace(
  `function extractParagraphs(body: Element, zip: PizZip, relsMap: Record<string, string>): DocParagraph[] {`,
  `function extractParagraphs(body: Element, zip: PizZip, relsMap: Record<string, string>, extractedBookmarks: ExtractedBookmark[], activeBookmarks: Record<string, Partial<ExtractedBookmark>>): DocParagraph[] {`
);

code = code.replace(
  `const para = parseParagraph(node, index, zip, relsMap, tableCtx);`,
  `const para = parseParagraph(node, index, zip, relsMap, tableCtx, extractedBookmarks, activeBookmarks);`
);

code = code.replace(
  `function parseParagraph(
  para: Element,
  index: number,
  zip: PizZip,
  relsMap: Record<string, string>,
  tableCtx?: TableContext
): DocParagraph {`,
  `function parseParagraph(
  para: Element,
  index: number,
  zip: PizZip,
  relsMap: Record<string, string>,
  tableCtx?: TableContext,
  extractedBookmarks?: ExtractedBookmark[],
  activeBookmarks?: Record<string, Partial<ExtractedBookmark>>
): DocParagraph {`
);

code = code.replace(
  `const runs = extractRuns(para, index, zip, relsMap);`,
  `const runs = extractRuns(para, index, zip, relsMap, extractedBookmarks, activeBookmarks);`
);

code = code.replace(
  `function extractRuns(para: Element, paraIndex: number, zip: PizZip, relsMap: Record<string, string>): DocRun[] {
  const runs: DocRun[] = [];
  let runIndex = 0;

  function visitNode(node: Element) {
    const localName = node.localName;
    const nsURI = node.namespaceURI;

    if (nsURI === NS.w && localName === 'r') {
      const run = parseRun(node, paraIndex, runIndex, zip, relsMap);
      if (run !== null) {
        runs.push(run);
        runIndex++;
      }
      return;
    }`,
  `function extractRuns(para: Element, paraIndex: number, zip: PizZip, relsMap: Record<string, string>, extractedBookmarks?: ExtractedBookmark[], activeBookmarks?: Record<string, Partial<ExtractedBookmark>>): DocRun[] {
  const runs: DocRun[] = [];
  let runIndex = 0;
  let textOffset = 0;

  function visitNode(node: Element) {
    const localName = node.localName;
    const nsURI = node.namespaceURI;

    if (nsURI === NS.w && localName === 'bookmarkStart' && activeBookmarks) {
      const id = node.getAttributeNS(NS.w, 'id') || node.getAttribute('w:id');
      const name = node.getAttributeNS(NS.w, 'name') || node.getAttribute('w:name');
      if (id && name && name.includes('_')) { // Only care about tags with suffix
        activeBookmarks[id] = { id, name, paragraphIndex: paraIndex, startOffset: textOffset, runId: \`p\${paraIndex}_r\${runIndex}\` };
      }
      return;
    }

    if (nsURI === NS.w && localName === 'bookmarkEnd' && activeBookmarks && extractedBookmarks) {
      const id = node.getAttributeNS(NS.w, 'id') || node.getAttribute('w:id');
      if (id && activeBookmarks[id]) {
        const bm = activeBookmarks[id];
        if (bm.name && bm.paragraphIndex !== undefined && bm.startOffset !== undefined) {
          extractedBookmarks.push({
            id: bm.id as string,
            name: bm.name,
            paragraphIndex: bm.paragraphIndex,
            startOffset: bm.startOffset,
            endOffset: textOffset,
            runId: bm.runId, // Useful if the bookmark immediately precedes an object run
          });
        }
        delete activeBookmarks[id];
      }
      return;
    }

    if (nsURI === NS.w && localName === 'r') {
      const run = parseRun(node, paraIndex, runIndex, zip, relsMap);
      if (run !== null) {
        runs.push(run);
        textOffset += run.text.length;
        runIndex++;
      }
      return;
    }`
);

code = code.replace(
  `    // For other direct children of the paragraph
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 1) {
        const childEl = child as Element;
        if (childEl.namespaceURI === NS.w && childEl.localName === 'r') {
          const run = parseRun(childEl, paraIndex, runIndex, zip, relsMap);
          if (run !== null) {
            runs.push(run);
            runIndex++;
          }
        }
      }
    }`,
  `    // For other direct children of the paragraph
    const children = node.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 1) {
        visitNode(child as Element);
      }
    }`
);

code += `

function reconcileTagsWithBookmarks(
  tags: Tag[],
  extractedBookmarks: ExtractedBookmark[],
  paragraphs: DocParagraph[]
): Tag[] {
  return tags;
}
`;

fs.writeFileSync('src/docx/DocxParser.ts', code);
