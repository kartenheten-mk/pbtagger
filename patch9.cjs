const fs = require('fs');
let code = fs.readFileSync('src/docx/DocxParser.ts', 'utf8');

code = code.replace(
  `import { getBookmarkSuffix, guessCategoryIdFromBookmarkName } from './bookmarkUtils';\nimport { v4 as uuidv4 } from 'uuid';\nimport { getParagraphText } from './DocxParser';`,
  `import { getBookmarkSuffix, guessCategoryIdFromBookmarkName } from './bookmarkUtils';`
);

fs.writeFileSync('src/docx/DocxParser.ts', code);
