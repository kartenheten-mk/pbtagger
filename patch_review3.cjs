const fs = require('fs');

let parserCode = fs.readFileSync('src/docx/DocxParser.ts', 'utf8');

// The code review mentioned getParagraphText being undefined.
// Let's check where it's imported from.
// It is imported from './DocxParser' originally, which is bad because it IS DocxParser.ts!
// Let's remove the import { getParagraphText } from './DocxParser' if it exists.
parserCode = parserCode.replace(
  `import { getBookmarkSuffix, guessCategoryIdFromBookmarkName } from './bookmarkUtils';\nimport { v4 as uuidv4 } from 'uuid';\nimport { getParagraphText } from './DocxParser';`,
  `import { getBookmarkSuffix, guessCategoryIdFromBookmarkName } from './bookmarkUtils';`
);

// We also need to fix the extractedBookmarks logic. The activeBookmarks issue:
parserCode = parserCode.replace(
  `    if (nsURI === NS.w && localName === 'bookmarkEnd' && activeBookmarks && extractedBookmarks) {
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
    }`,
  `    if (nsURI === NS.w && localName === 'bookmarkEnd' && activeBookmarks && extractedBookmarks) {
      const id = node.getAttributeNS(NS.w, 'id') || node.getAttribute('w:id');
      if (id && activeBookmarks[id]) {
        const bm = activeBookmarks[id];
        if (bm.name && bm.paragraphIndex !== undefined && bm.startOffset !== undefined) {
          let finalEndOffset = textOffset;
          if (bm.paragraphIndex !== paraIndex) {
              finalEndOffset = 999999;
          }
          extractedBookmarks.push({
            id: bm.id as string,
            name: bm.name,
            paragraphIndex: bm.paragraphIndex,
            startOffset: bm.startOffset,
            endOffset: finalEndOffset,
            runId: bm.runId, // Useful if the bookmark immediately precedes an object run
          });
        }
        delete activeBookmarks[id];
      }
      return;
    }`
);

fs.writeFileSync('src/docx/DocxParser.ts', parserCode);
