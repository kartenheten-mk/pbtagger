const fs = require('fs');

let parserCode = fs.readFileSync('src/docx/DocxParser.ts', 'utf8');

// The code review mentioned getParagraphText being undefined. Let's make sure it's defined and exported correctly.
// Also we need to ensure bookmarkUtils has the right regex.
let utilsCode = fs.readFileSync('src/docx/bookmarkUtils.ts', 'utf8');
utilsCode = utilsCode.replace(
  `/[^a-zA-Z0-9\\s_]/g`,
  `/[^a-zA-Z0-9\\\\s_]/g`
);
fs.writeFileSync('src/docx/bookmarkUtils.ts', utilsCode);
