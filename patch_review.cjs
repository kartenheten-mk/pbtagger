const fs = require('fs');

// 1. Fix regex bug in bookmarkUtils.ts
let utilsCode = fs.readFileSync('src/docx/bookmarkUtils.ts', 'utf8');
utilsCode = utilsCode.replace(
  `/[^a-zA-Z0-9\\s_]/g`,
  `/[^a-zA-Z0-9\\\\s_]/g`
);
fs.writeFileSync('src/docx/bookmarkUtils.ts', utilsCode);

// 2. Fix DocxParser.ts
let parserCode = fs.readFileSync('src/docx/DocxParser.ts', 'utf8');

// Fix getParagraphText import
if (!parserCode.includes('getParagraphText')) {
    // getParagraphText is already exported in DocxParser.ts, we just need to use it.
    // Wait, it is defined in DocxParser.ts later in the file.
}

// Fix multi-paragraph bookmarks
// If a bookmark spans multiple paragraphs, startOffset is in paragraph A and endOffset is in paragraph B.
// This is not supported by our Tag model, which expects startOffset and endOffset to be within the SAME paragraph.
// So if bookmarkEnd is in a different paragraph, we should either cap it at the end of the start paragraph,
// or handle it. In our case, the exporter only exports tags within a single paragraph.
// So if a bookmark spans multiple, it was edited in Word to do so. We should just cap it to the start paragraph's end.
// But wait, how do we know if it spanned?
// In extractRuns, textOffset resets per paragraph. activeBookmarks are passed by reference and survive across paragraphs!
// So if bookmarkStart is in Para 1, activeBookmarks[id].paragraphIndex = 1.
// If bookmarkEnd is in Para 2, it sets endOffset to textOffset in Para 2, but leaves paragraphIndex = 1.
// This is bad!
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
          // If the bookmark ends in a different paragraph than it started, cap the endOffset
          // to the end of the starting paragraph (or rather, the textOffset we reached at the end of the start para).
          // But since we are processing Para B now, we don't know the exact length of Para A.
          // Wait, if it's a different paragraph, we can just say endOffset = undefined and handle it later,
          // or we can set a flag.
          // Let's just store the endParagraphIndex too.
          let finalEndOffset = textOffset;
          if (bm.paragraphIndex !== paraIndex) {
              // Spans multiple paragraphs. Tag model doesn't support this well.
              // Just use the start paragraph and set endOffset to something large, or leave it.
              // Actually, if it spans, the text inside it might be huge.
              // We'll mark it as a multi-paragraph bookmark. For simplicity, we can set endOffset to the text length of the start paragraph later.
              finalEndOffset = 999999; // We will clamp this in reconcileTagsWithBookmarks
          }

          extractedBookmarks.push({
            id: bm.id as string,
            name: bm.name,
            paragraphIndex: bm.paragraphIndex,
            startOffset: bm.startOffset,
            endOffset: finalEndOffset,
            runId: bm.runId,
          });
        }
        delete activeBookmarks[id];
      }
      return;
    }`
);

parserCode = parserCode.replace(
  `// Re-extract the text to ensure it matches the new offsets
          const para = paragraphs[tag.paragraphIndex];
          if (para) {
            const paraText = getParagraphText(para);
            tag.text = paraText.slice(tag.startOffset, tag.endOffset);
          }`,
  `// Re-extract the text to ensure it matches the new offsets
          const para = paragraphs[tag.paragraphIndex];
          if (para) {
            const paraText = getParagraphText(para);
            // Clamp endOffset if it was a multi-paragraph bookmark
            if (tag.endOffset > paraText.length) {
                tag.endOffset = paraText.length;
            }
            tag.text = paraText.slice(tag.startOffset, tag.endOffset);
          }`
);

parserCode = parserCode.replace(
  `if (newTag.targetType === 'text') {
           const para = paragraphs[newTag.paragraphIndex];
           if (para) {
             const paraText = getParagraphText(para);
             newTag.text = paraText.slice(newTag.startOffset, newTag.endOffset);
           }
        }`,
  `if (newTag.targetType === 'text') {
           const para = paragraphs[newTag.paragraphIndex];
           if (para) {
             const paraText = getParagraphText(para);
             // Clamp endOffset if it was a multi-paragraph bookmark
             if (newTag.endOffset > paraText.length) {
                 newTag.endOffset = paraText.length;
             }
             newTag.text = paraText.slice(newTag.startOffset, newTag.endOffset);
           }
        }`
);

fs.writeFileSync('src/docx/DocxParser.ts', parserCode);
