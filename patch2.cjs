const fs = require('fs');
let code = fs.readFileSync('src/docx/DocxParser.ts', 'utf8');

code = code.replace(
  `function reconcileTagsWithBookmarks(
  tags: Tag[],
  extractedBookmarks: ExtractedBookmark[],
  paragraphs: DocParagraph[]
): Tag[] {
  return tags;
}`,
  `function reconcileTagsWithBookmarks(
  tags: Tag[],
  _extractedBookmarks: ExtractedBookmark[],
  _paragraphs: DocParagraph[]
): Tag[] {
  return tags;
}`
);

fs.writeFileSync('src/docx/DocxParser.ts', code);
