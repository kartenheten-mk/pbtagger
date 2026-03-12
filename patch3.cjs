const fs = require('fs');
let code = fs.readFileSync('src/docx/DocxParser.ts', 'utf8');

code = code.replace(
  `function reconcileTagsWithBookmarks(
  tags: Tag[],
  _extractedBookmarks: ExtractedBookmark[],
  _paragraphs: DocParagraph[]
): Tag[] {
  return tags;
}`,
  `function reconcileTagsWithBookmarks(
  tags: Tag[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _extractedBookmarks: ExtractedBookmark[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _paragraphs: DocParagraph[]
): Tag[] {
  return tags;
}`
);

fs.writeFileSync('src/docx/DocxParser.ts', code);
