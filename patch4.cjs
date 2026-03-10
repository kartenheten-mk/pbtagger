const fs = require('fs');
let code = fs.readFileSync('src/docx/bookmarkUtils.ts', 'utf8');

code += `
/**
 * Parse a tag suffix (first 8 chars of UUID) from a bookmark name.
 */
export function getBookmarkSuffix(bookmarkName: string): string | null {
  const match = bookmarkName.match(/_([0-9a-f]{8})$/i);
  return match ? match[1].toLowerCase() : null;
}
`;

fs.writeFileSync('src/docx/bookmarkUtils.ts', code);
