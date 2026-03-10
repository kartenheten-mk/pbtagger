const fs = require('fs');
let code = fs.readFileSync('src/docx/DocxParser.ts', 'utf8');

code = `import { getBookmarkSuffix } from './bookmarkUtils';\n` + code;

code = code.replace(
  `function reconcileTagsWithBookmarks(
  tags: Tag[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _extractedBookmarks: ExtractedBookmark[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _paragraphs: DocParagraph[]
): Tag[] {
  return tags;
}`,
  `function reconcileTagsWithBookmarks(
  tags: Tag[],
  extractedBookmarks: ExtractedBookmark[],
  paragraphs: DocParagraph[]
): Tag[] {
  // Create a map from UUID suffix to Tag for easy lookup
  const tagBySuffix = new Map<string, Tag>();
  for (const tag of tags) {
    const suffix = tag.uuid.replace(/-/g, '').slice(0, 8).toLowerCase();
    tagBySuffix.set(suffix, tag);
  }

  const processedSuffixes = new Set<string>();

  // 1. Reconcile existing tags with bookmarks
  for (const bm of extractedBookmarks) {
    const suffix = getBookmarkSuffix(bm.name);
    if (!suffix) continue;

    processedSuffixes.add(suffix);
    const tag = tagBySuffix.get(suffix);

    if (tag) {
      // Update the tag's position based on the bookmark
      tag.paragraphIndex = bm.paragraphIndex;

      if (tag.targetType === 'image' || tag.targetType === 'graph') {
        // Object tags use runId
        if (bm.runId) {
          tag.runId = bm.runId;
        }
      } else {
        // Text tags use offsets
        if (bm.startOffset !== undefined && bm.endOffset !== undefined) {
          tag.startOffset = bm.startOffset;
          tag.endOffset = bm.endOffset;

          // Re-extract the text to ensure it matches the new offsets
          const para = paragraphs[tag.paragraphIndex];
          if (para) {
            const paraText = getParagraphText(para);
            tag.text = paraText.slice(tag.startOffset, tag.endOffset);
          }
        }
      }
    }
  }

  // 2. Remove tags that were present in customXml but have no corresponding bookmark.
  // This indicates the user deleted the tagged content or the bookmark in Word.
  // Alternatively, maybe we just leave them alone if the text is still there?
  // Usually, bookmarks are the source of truth if the document was edited in Word.
  // Actually, wait, let's keep all tags for now, as maybe the customXml is accurate
  // and bookmarks were just lost for some reason. But actually we want the tags to reflect bookmarks!
  // If the user deleted the bookmark in Word, the tag should be gone.
  // Wait, what if the document *wasn't* exported by us, and just has no bookmarks?
  // Let's filter out tags that have *no* matching bookmark ONLY IF we found at least one of our bookmarks.
  // Because if we found 0 bookmarks, maybe they exported without tags or something, though customXml exists.
  // Actually, if customXml exists, it was exported by us. If a tag is missing its bookmark, it was deleted.

  if (extractedBookmarks.some(bm => getBookmarkSuffix(bm.name) !== null)) {
    tags = tags.filter(tag => {
      const suffix = tag.uuid.replace(/-/g, '').slice(0, 8).toLowerCase();
      return processedSuffixes.has(suffix);
    });
  }

  return tags;
}`
);

fs.writeFileSync('src/docx/DocxParser.ts', code);
