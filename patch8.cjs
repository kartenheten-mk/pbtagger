const fs = require('fs');
let code = fs.readFileSync('src/docx/DocxParser.ts', 'utf8');

code = code.replace(
  `import { getBookmarkSuffix } from './bookmarkUtils';`,
  `import { getBookmarkSuffix, guessCategoryIdFromBookmarkName } from './bookmarkUtils';\nimport { v4 as uuidv4 } from 'uuid';\nimport { getParagraphText } from './DocxParser';`
);

code = code.replace(
  `  if (extractedBookmarks.some(bm => getBookmarkSuffix(bm.name) !== null)) {
    tags = tags.filter(tag => {
      const suffix = tag.uuid.replace(/-/g, '').slice(0, 8).toLowerCase();
      return processedSuffixes.has(suffix);
    });
  }`,
  `  if (extractedBookmarks.some(bm => getBookmarkSuffix(bm.name) !== null)) {
    tags = tags.filter(tag => {
      const suffix = tag.uuid.replace(/-/g, '').slice(0, 8).toLowerCase();
      return processedSuffixes.has(suffix);
    });
  }

  // 3. Create new tags from unmatched bookmarks
  for (const bm of extractedBookmarks) {
    const suffix = getBookmarkSuffix(bm.name);
    if (!suffix) continue;

    if (!processedSuffixes.has(suffix)) {
      // It's a validly named bookmark but missing from customXml
      const guessedCategoryId = guessCategoryIdFromBookmarkName(bm.name);

      if (guessedCategoryId) {
        // Use a real UUID, starting with the suffix if possible, or just generate new
        // e.g. suffix + '-0000-0000-0000-000000000000'
        const newUuid = suffix + '-0000-0000-0000-000000000000';

        const newTag: Tag = {
          uuid: newUuid,
          categoryId: guessedCategoryId,
          targetType: bm.runId ? 'image' : 'text', // Heuristic: runId presence -> object tag
          paragraphIndex: bm.paragraphIndex,
          startOffset: bm.startOffset || 0,
          endOffset: bm.endOffset || 0,
          runId: bm.runId,
          text: '',
          createdAt: new Date().toISOString(),
        };

        if (newTag.targetType === 'text') {
           const para = paragraphs[newTag.paragraphIndex];
           if (para) {
             const paraText = getParagraphText(para);
             newTag.text = paraText.slice(newTag.startOffset, newTag.endOffset);
           }
        }

        tags.push(newTag);
      }
    }
  }`
);

fs.writeFileSync('src/docx/DocxParser.ts', code);
