const fs = require('fs');

let utilsCode = fs.readFileSync('src/docx/bookmarkUtils.ts', 'utf8');
utilsCode = utilsCode.replace(
  /\.replace\(\/\[\^a-zA-Z0-9s_\]\/g, ''\)/g,
  `.replace(/[^a-zA-Z0-9\\\\s_]/g, '')`
);
fs.writeFileSync('src/docx/bookmarkUtils.ts', utilsCode);
